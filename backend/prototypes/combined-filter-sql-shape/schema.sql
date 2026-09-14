-- PROTOTYPE — throwaway. Not the real schema; just enough of it to make the
SET client_min_messages = warning;

-- combined-filter question measurable. See README.md.

DROP TABLE IF EXISTS question_tags, permission_grants, questions, tags, categories, clients, viewers CASCADE;

CREATE TABLE categories (
  id   int  PRIMARY KEY,
  name text NOT NULL UNIQUE
);

-- A Tag belongs to exactly one Category (CONTEXT.md).
CREATE TABLE tags (
  id          int  PRIMARY KEY,
  category_id int  NOT NULL REFERENCES categories(id),
  name        text NOT NULL,
  UNIQUE (category_id, name)
);
CREATE INDEX tags_category_id_idx ON tags (category_id);

CREATE TABLE clients (
  id   int  PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE viewers (
  id   int  PRIMARY KEY,
  name text NOT NULL UNIQUE
);

-- The authority for one Viewer to see one Client's Questions.
CREATE TABLE permission_grants (
  viewer_id int NOT NULL REFERENCES viewers(id),
  client_id int NOT NULL REFERENCES clients(id),
  PRIMARY KEY (viewer_id, client_id)
);

CREATE TABLE questions (
  id           int         PRIMARY KEY,
  text         text        NOT NULL,
  answer_notes text        NOT NULL,
  client_id    int         REFERENCES clients(id),   -- NULL = unrestricted
  created_at   timestamptz NOT NULL
);

CREATE TABLE question_tags (
  question_id int NOT NULL REFERENCES questions(id),
  tag_id      int NOT NULL REFERENCES tags(id),
  PRIMARY KEY (question_id, tag_id)
);

-- The reverse lookup both shapes lean on: tag -> questions.
CREATE INDEX question_tags_tag_id_question_id_idx ON question_tags (tag_id, question_id);

-- Stable ordering for pagination, id as tiebreaker (issue #6).
CREATE INDEX questions_created_at_id_idx ON questions (created_at DESC, id DESC);
CREATE INDEX questions_client_id_idx     ON questions (client_id);
