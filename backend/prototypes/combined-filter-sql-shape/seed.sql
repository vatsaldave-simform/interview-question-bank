-- PROTOTYPE — throwaway bulk generator. 10k Questions across a dozen Categories
-- with a skewed (Zipf-ish) Tag distribution, so that "broad tag" and "narrow tag"
-- are genuinely different selectivities rather than a uniform blur.
--
-- Randomness is a deterministic hash of the row, not random(). A volatile random()
-- in a join qualifier or a generate_series bound gets evaluated ONCE rather than
-- per row, which silently collapsed the distribution on the first attempt: every
-- Category ended up on exactly one coin flip. Hashing the row key cannot be hoisted
-- and makes the bank byte-identical on every run.

SET client_min_messages = warning;

-- Bank size. run.sh passes -v n_questions=$ROWS; defaults to 10000 standalone.
\if :{?n_questions}
\else
  \set n_questions 10000
\endif

-- Pseudo-random double in [0,1) derived from a row key.
CREATE OR REPLACE FUNCTION prnd(key text) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (('x' || substr(md5(key), 1, 8))::bit(32)::bigint & 2147483647)::double precision / 2147483647.0
$$;

CREATE TEMP TABLE cat_spec (id int, name text, n_tags int, coverage numeric, max_tags int);
INSERT INTO cat_spec VALUES
  ( 1, 'technology',      40, 0.95, 3),
  ( 2, 'seniority',        5, 1.00, 1),
  ( 3, 'question-type',    8, 1.00, 2),
  ( 4, 'role',            12, 0.70, 2),
  ( 5, 'format',           6, 0.50, 1),
  ( 6, 'difficulty',       4, 1.00, 1),
  ( 7, 'competency',      15, 0.60, 3),
  ( 8, 'language',        20, 0.80, 2),
  ( 9, 'framework',       30, 0.50, 2),
  (10, 'domain-area',     18, 0.45, 2),
  (11, 'interview-stage',  5, 0.90, 1),
  (12, 'source',           7, 0.30, 1);

INSERT INTO categories (id, name)
SELECT id, name FROM cat_spec;

INSERT INTO tags (id, category_id, name)
SELECT (row_number() OVER (ORDER BY s.id, g))::int, s.id, s.name || '-' || g
FROM cat_spec s, LATERAL generate_series(1, s.n_tags) g;

INSERT INTO clients (id, name)
SELECT g, 'client-' || g FROM generate_series(1, 5) g;

INSERT INTO viewers (id, name) VALUES
  (1, 'viewer-with-two-grants'),
  (2, 'viewer-with-no-grants');

INSERT INTO permission_grants (viewer_id, client_id) VALUES (1, 1), (1, 2);

-- 10k Questions; ~20% restricted to one of five Clients.
-- created_at is deliberately NOT correlated with id, so the ordering index is not
-- accidentally aligned with heap order.
INSERT INTO questions (id, text, answer_notes, client_id, created_at)
SELECT g,
       'Question ' || g || ': how would you approach the problem described in case ' || g || '?',
       'Answer notes for question ' || g || ': look for structured reasoning and trade-off awareness.',
       CASE WHEN prnd(g || ':client') < 0.20 THEN 1 + floor(prnd(g || ':which-client') * 5)::int END,
       timestamptz '2024-01-01 00:00:00+00' + floor(prnd(g || ':created') * 525600)::int * interval '1 minute'
FROM generate_series(1, :n_questions) g;

-- Which (Question, Category) pairs exist at all.
CREATE TEMP TABLE qc AS
SELECT q.id AS question_id, s.id AS category_id, s.n_tags, s.max_tags
FROM questions q
CROSS JOIN cat_spec s
WHERE prnd(q.id || ':cov:' || s.id) < s.coverage;

-- Pick Tags within each pair, skewed toward the low ordinals so some Tags are
-- common and some are rare.
INSERT INTO question_tags (question_id, tag_id)
SELECT DISTINCT qc.question_id, tg.id
FROM qc
CROSS JOIN LATERAL generate_series(
  1, 1 + floor(prnd(qc.question_id || ':n:' || qc.category_id) * qc.max_tags)::int
) AS pick
JOIN LATERAL (
  SELECT t.id
  FROM tags t
  WHERE t.category_id = qc.category_id
  ORDER BY t.id
  OFFSET floor(
    power(prnd(qc.question_id || ':t:' || qc.category_id || ':' || pick), 2.2) * qc.n_tags
  )::int
  LIMIT 1
) tg ON true;

DROP TABLE qc;

VACUUM ANALYZE;
