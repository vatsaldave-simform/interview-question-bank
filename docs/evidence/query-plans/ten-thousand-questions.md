# Query plans at 10,007 Questions

Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the
deployment: free-tier compute is throttled and shared, so a timing taken there measures
the host's spare capacity rather than the indexing decision it is meant to defend
(ADR-0012).

Measured at 2026-09-22T15:51:18.388Z against PostgreSQL 16.15.

Every statement is the one the search sends, taken from the repository itself rather
than retyped here, so this cannot get out of sync with what ships. The tables are
vacuumed and analysed first, and each plan is the second of two runs, so neither a
cold cache nor a missing visibility map is what gets measured.

| scenario | ms | pages | whole table read | indexes used |
| --- | ---: | ---: | --- | --- |
| a broad keyword, no Category | 5.45 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a narrow keyword, no Category | 2.21 | 556 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| two keywords, no Category | 1.45 | 264 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword and a common Tag | 5.69 | 1076 | no | "question_tags_tagId_questionId_idx", "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword and a rare Tag | 2.40 | 898 | no | "question_tags_tagId_questionId_idx", question_tags_pkey, questions_pkey |
| a narrow keyword and a common Tag | 2.49 | 1108 | no | "question_tags_tagId_questionId_idx", "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword and two Categories | 7.33 | 1117 | no | "question_tags_tagId_questionId_idx", "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, a deep page | 7.26 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, as the Author | 5.83 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, as a Reviewer | 5.44 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |

## The plans

### a broad keyword, no Category

The keyword alone, matching about half the bank. The baseline every other plan is read against.

```
Nested Loop Left Join  (cost=6112.94..6825.43 rows=50 width=337) (actual time=3.808..5.292 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6105.51..6452.98 rows=50 width=305) (actual time=3.708..3.810 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6105.23..6105.35 rows=50 width=20) (actual time=3.677..3.685 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6105.23..6114.08 rows=3540 width=20) (actual time=3.677..3.681 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.47..5987.63 rows=3540 width=20) (actual time=0.584..3.133 rows=3884 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Rows Removed by Filter: 1049
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.496..0.496 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.029..0.029 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.015..0.023 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.009..0.017 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.024..0.025 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.017..0.017 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.666 ms
Execution Time: 5.451 ms
```

### a narrow keyword, no Category

The same query aimed at one Question in fifty. The planner should not answer it the same way.

```
Nested Loop Left Join  (cost=57.96..113.30 rows=4 width=337) (actual time=0.504..2.067 rows=50 loops=1)
  Buffers: shared hit=556
  ->  Nested Loop  (cost=50.53..83.51 rows=4 width=305) (actual time=0.423..0.524 rows=50 loops=1)
        Buffers: shared hit=354
        ->  Limit  (cost=50.24..50.25 rows=4 width=20) (actual time=0.411..0.419 rows=50 loops=1)
              Buffers: shared hit=204
              ->  Sort  (cost=50.24..50.25 rows=4 width=20) (actual time=0.410..0.414 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''ubiquit'' & ''languag'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 30kB
                    Buffers: shared hit=204
                    ->  Bitmap Heap Scan on questions q_1  (cost=21.49..50.20 rows=4 width=20) (actual time=0.080..0.351 rows=193 loops=1)
                          Recheck Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Rows Removed by Filter: 54
                          Heap Blocks: exact=198
                          Buffers: shared hit=204
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..21.49 rows=6 width=0) (actual time=0.050..0.051 rows=247 loops=1)
                                Index Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                Buffers: shared hit=5
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.005..0.005 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.015..0.023 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.017 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.009..0.009 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.680 ms
Execution Time: 2.210 ms
```

### two keywords, no Category

Two words are AND-ed, which reaches a smaller part of the bank than either word alone.

```
Nested Loop Left Join  (cost=244.41..768.21 rows=36 width=337) (actual time=0.284..1.281 rows=31 loops=1)
  Buffers: shared hit=264
  ->  Nested Loop  (cost=236.98..500.04 rows=36 width=305) (actual time=0.209..0.287 rows=31 loops=1)
        Buffers: shared hit=138
        ->  Limit  (cost=236.70..236.79 rows=36 width=20) (actual time=0.197..0.202 rows=31 loops=1)
              Buffers: shared hit=45
              ->  Sort  (cost=236.70..236.79 rows=36 width=20) (actual time=0.196..0.198 rows=31 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''migrat'' & ''deadlock'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 27kB
                    Buffers: shared hit=45
                    ->  Bitmap Heap Scan on questions q_1  (cost=21.72..235.77 rows=36 width=20) (actual time=0.114..0.180 rows=31 loops=1)
                          Recheck Cond: ("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Rows Removed by Filter: 10
                          Heap Blocks: exact=39
                          Buffers: shared hit=45
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..21.71 rows=51 width=0) (actual time=0.094..0.094 rows=41 loops=1)
                                Index Cond: ("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery)
                                Buffers: shared hit=5
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..7.30 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=31)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=93
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.031..0.032 rows=1 loops=31)
        Buffers: shared hit=126
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.017..0.024 rows=4 loops=31)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=126
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.018 rows=4 loops=31)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=125
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=31)
                          Buffers: shared hit=31
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=4 loops=31)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=94
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.003 rows=4 loops=31)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=94
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.660 ms
Execution Time: 1.446 ms
```

### a broad keyword and a common Tag

The combined query this ticket exists for: the keyword index and the Tag index are both usable, and the planner has to choose.

```
Nested Loop Left Join  (cost=6230.62..6943.11 rows=50 width=337) (actual time=3.924..5.492 rows=50 loops=1)
  Buffers: shared hit=1076
  ->  Nested Loop  (cost=6223.19..6570.65 rows=50 width=305) (actual time=3.847..3.956 rows=50 loops=1)
        Buffers: shared hit=874
        ->  Limit  (cost=6222.90..6223.03 rows=50 width=20) (actual time=3.825..3.835 rows=50 loops=1)
              Buffers: shared hit=724
              ->  Sort  (cost=6222.90..6225.53 rows=1052 width=20) (actual time=3.824..3.830 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=724
                    ->  Hash Semi Join  (cost=224.07..6187.96 rows=1052 width=20) (actual time=1.254..3.625 rows=1147 loops=1)
                          Hash Cond: (q_1.id = qt."questionId")
                          Buffers: shared hit=724
                          ->  Bitmap Heap Scan on questions q_1  (cost=42.47..5978.78 rows=3540 width=274) (actual time=0.496..2.115 rows=3884 loops=1)
                                Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Rows Removed by Filter: 1049
                                Heap Blocks: exact=695
                                Buffers: shared hit=700
                                ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.415..0.415 rows=4933 loops=1)
                                      Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Buffers: shared hit=4
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                        Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
                          ->  Hash  (cost=144.44..144.44 rows=2973 width=16) (actual time=0.742..0.742 rows=2962 loops=1)
                                Buckets: 4096  Batches: 1  Memory Usage: 171kB
                                Buffers: shared hit=24
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..144.44 rows=2973 width=16) (actual time=0.021..0.339 rows=2962 loops=1)
                                      Index Cond: ("tagId" = ANY ('{59e70e7c-94fe-4a5b-b8c9-abeff1d75f0f}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=24
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.024 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.017 rows=5 loops=50)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.009..0.009 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=49
Planning Time: 1.043 ms
Execution Time: 5.688 ms
```

### a broad keyword and a rare Tag

The same pair with the selective half swapped onto the Tag, which is where driving from question_tags should start to win.

```
Nested Loop Left Join  (cost=1081.15..1793.64 rows=50 width=337) (actual time=0.714..2.246 rows=50 loops=1)
  Buffers: shared hit=898
  ->  Nested Loop  (cost=1073.72..1421.19 rows=50 width=305) (actual time=0.644..0.741 rows=50 loops=1)
        Buffers: shared hit=696
        ->  Limit  (cost=1073.43..1073.56 rows=50 width=20) (actual time=0.632..0.640 rows=50 loops=1)
              Buffers: shared hit=546
              ->  Sort  (cost=1073.43..1073.59 rows=63 width=20) (actual time=0.632..0.636 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 29kB
                    Buffers: shared hit=546
                    ->  Nested Loop  (cost=12.28..1071.55 rows=63 width=20) (actual time=0.112..0.605 rows=61 loops=1)
                          Buffers: shared hit=546
                          ->  HashAggregate  (cost=11.99..13.77 rows=178 width=16) (actual time=0.094..0.113 rows=180 loops=1)
                                Group Key: qt."questionId"
                                Batches: 1  Memory Usage: 40kB
                                Buffers: shared hit=5
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..11.55 rows=179 width=16) (actual time=0.019..0.039 rows=180 loops=1)
                                      Index Cond: ("tagId" = ANY ('{a239f688-62c1-454f-9378-634fb9996a92}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=5
                          ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..6.03 rows=1 width=274) (actual time=0.002..0.002 rows=0 loops=180)
                                Index Cond: (id = qt."questionId")
                                Filter: (("searchVector" @@ '''test'''::tsquery) AND (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Rows Removed by Filter: 1
                                Buffers: shared hit=541
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                        Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.015..0.023 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.017 rows=5 loops=50)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.011..0.011 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=49
Planning Time: 0.963 ms
Execution Time: 2.402 ms
```

### a narrow keyword and a common Tag

Selective on the keyword instead, so the two indexes swap roles.

```
Nested Loop Left Join  (cost=75.67..83.72 rows=1 width=337) (actual time=0.723..2.330 rows=46 loops=1)
  Buffers: shared hit=1108
  ->  Nested Loop  (cost=68.24..76.28 rows=1 width=305) (actual time=0.657..0.763 rows=46 loops=1)
        Buffers: shared hit=922
        ->  Limit  (cost=67.96..67.96 rows=1 width=20) (actual time=0.645..0.654 rows=46 loops=1)
              Buffers: shared hit=784
              ->  Sort  (cost=67.96..67.96 rows=1 width=20) (actual time=0.645..0.650 rows=46 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''ubiquit'' & ''languag'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 28kB
                    Buffers: shared hit=784
                    ->  Nested Loop Semi Join  (cost=21.91..67.95 rows=1 width=20) (actual time=0.089..0.626 rows=46 loops=1)
                          Buffers: shared hit=784
                          ->  Bitmap Heap Scan on questions q_1  (cost=21.49..50.19 rows=4 width=274) (actual time=0.072..0.257 rows=193 loops=1)
                                Recheck Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Rows Removed by Filter: 54
                                Heap Blocks: exact=198
                                Buffers: shared hit=204
                                ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..21.49 rows=6 width=0) (actual time=0.047..0.048 rows=247 loops=1)
                                      Index Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                      Buffers: shared hit=5
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.002..0.003 rows=1 loops=1)
                                        Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
                          ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..4.43 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=193)
                                Index Cond: (("tagId" = ANY ('{59e70e7c-94fe-4a5b-b8c9-abeff1d75f0f}'::uuid[])) AND ("questionId" = q_1.id))
                                Heap Fetches: 0
                                Buffers: shared hit=580
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=46)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=138
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.034..0.034 rows=1 loops=46)
        Buffers: shared hit=186
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.019..0.027 rows=5 loops=46)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=186
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.013..0.021 rows=5 loops=46)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=185
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.003 rows=61 loops=46)
                          Buffers: shared hit=46
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=5 loops=46)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=139
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=5 loops=46)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=139
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.008 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=49
Planning Time: 0.841 ms
Execution Time: 2.490 ms
```

### a broad keyword and two Categories

One EXISTS per Category is the shape ADR-0011 chose; this is that shape with the search on top of it.

```
Nested Loop Left Join  (cost=6512.97..7225.46 rows=50 width=337) (actual time=5.358..7.037 rows=50 loops=1)
  Buffers: shared hit=1117
  ->  Nested Loop  (cost=6505.54..6853.00 rows=50 width=305) (actual time=5.266..5.399 rows=50 loops=1)
        Buffers: shared hit=915
        ->  Limit  (cost=6505.25..6505.38 rows=50 width=20) (actual time=5.231..5.243 rows=50 loops=1)
              Buffers: shared hit=765
              ->  Sort  (cost=6505.25..6506.51 rows=504 width=20) (actual time=5.230..5.238 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=765
                    ->  Hash Semi Join  (cost=515.74..6488.51 rows=504 width=20) (actual time=2.470..5.112 rows=553 loops=1)
                          Hash Cond: (qt."questionId" = qt_1."questionId")
                          Buffers: shared hit=765
                          ->  Hash Semi Join  (cost=224.07..6185.33 rows=1052 width=290) (actual time=1.261..3.604 rows=1147 loops=1)
                                Hash Cond: (q_1.id = qt."questionId")
                                Buffers: shared hit=724
                                ->  Bitmap Heap Scan on questions q_1  (cost=42.47..5978.78 rows=3540 width=274) (actual time=0.510..2.265 rows=3884 loops=1)
                                      Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                      Rows Removed by Filter: 1049
                                      Heap Blocks: exact=695
                                      Buffers: shared hit=700
                                      ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.427..0.427 rows=4933 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                      SubPlan 2
                                        ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                                              Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                              Rows Removed by Filter: 2
                                              Buffers: shared hit=1
                                ->  Hash  (cost=144.44..144.44 rows=2973 width=16) (actual time=0.735..0.736 rows=2962 loops=1)
                                      Buckets: 4096  Batches: 1  Memory Usage: 171kB
                                      Buffers: shared hit=24
                                      ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..144.44 rows=2973 width=16) (actual time=0.021..0.335 rows=2962 loops=1)
                                            Index Cond: ("tagId" = ANY ('{59e70e7c-94fe-4a5b-b8c9-abeff1d75f0f}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=24
                          ->  Hash  (cost=231.98..231.98 rows=4775 width=16) (actual time=1.171..1.172 rows=4825 loops=1)
                                Buckets: 8192  Batches: 1  Memory Usage: 291kB
                                Buffers: shared hit=41
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt_1  (cost=0.41..231.98 rows=4775 width=16) (actual time=0.018..0.537 rows=4825 loops=1)
                                      Index Cond: ("tagId" = ANY ('{24dfdbe3-ece1-490d-b8ed-ed33b63c86c1}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=41
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.032..0.032 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.026 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.019 rows=5 loops=50)
                    Hash Cond: (t.id = qt_2."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.005 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_2  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.012..0.012 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.005..0.005 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=109
Planning Time: 1.230 ms
Execution Time: 7.331 ms
```

### a broad keyword, a deep page

Where the limit-and-offset ceiling sits: the skipped rows still have to be produced and thrown away.

```
Nested Loop Left Join  (cost=6209.02..6921.51 rows=50 width=337) (actual time=5.445..7.039 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6201.59..6549.06 rows=50 width=305) (actual time=5.351..5.480 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6201.30..6201.43 rows=50 width=20) (actual time=5.310..5.321 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6196.30..6205.15 rows=3540 width=20) (actual time=5.120..5.231 rows=2050 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 370kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.47..5987.63 rows=3540 width=20) (actual time=0.578..3.208 rows=3884 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Rows Removed by Filter: 1049
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.480..0.481 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.005..0.005 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.031..0.031 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.024 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.018 rows=5 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.013..0.014 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.005..0.006 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.666 ms
Execution Time: 7.258 ms
```

### a broad keyword, as the Author

The second check becomes published OR authored by this Viewer, and the Author wrote the whole bulk bank.

```
Nested Loop Left Join  (cost=6144.99..6857.48 rows=50 width=337) (actual time=4.142..5.664 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6137.56..6485.03 rows=50 width=305) (actual time=4.053..4.160 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6137.27..6137.40 rows=50 width=20) (actual time=4.030..4.038 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6137.27..6148.35 rows=4431 width=20) (actual time=4.029..4.033 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 30kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5990.08 rows=4431 width=20) (actual time=0.604..3.307 rows=4933 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '8a9c110e-47ce-4bcf-a1b8-1f4ab6225a62'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.499..0.499 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '8a9c110e-47ce-4bcf-a1b8-1f4ab6225a62'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.015..0.023 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.009..0.017 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.013..0.013 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.686 ms
Execution Time: 5.825 ms
```

### a broad keyword, as a Reviewer

A Reviewer drops the second check entirely (ADR-0013), so this is the widest the query ever gets.

```
Nested Loop Left Join  (cost=6120.32..6832.82 rows=50 width=337) (actual time=3.766..5.275 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6112.89..6460.36 rows=50 width=305) (actual time=3.676..3.778 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6112.61..6112.73 rows=50 width=20) (actual time=3.653..3.661 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6112.61..6123.69 rows=4431 width=20) (actual time=3.651..3.656 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5965.42 rows=4431 width=20) (actual time=0.798..3.101 rows=3928 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: (("clientId" IS NULL) OR (hashed SubPlan 2))
                          Rows Removed by Filter: 1005
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.695..0.695 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.006..0.006 rows=1 loops=1)
                                  Filter: ("viewerId" = 'b6560387-4fdf-4180-875c-1a9eaa2f0bb7'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.029..0.029 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.023 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.017 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.011..0.011 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.634 ms
Execution Time: 5.439 ms
```
