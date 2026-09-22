# Query plans at 10,007 Questions

Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the
deployment: free-tier compute is throttled and shared, so a timing taken there measures
the host's spare capacity rather than the indexing decision it is meant to defend
(ADR-0012).

Measured at 2026-09-22T16:15:08.537Z against PostgreSQL 16.15.

Every statement is the one the search sends, taken from the repository itself rather
than retyped here, so this cannot get out of sync with what ships. The tables are
vacuumed and analysed first, and each plan is the second of two runs, so neither a
cold cache nor a missing visibility map is what gets measured.

| scenario | ms | pages | whole table read | indexes used |
| --- | ---: | ---: | --- | --- |
| a broad keyword, no Category | 6.27 | 1053 | no | "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| a narrow keyword, no Category | 2.48 | 520 | no | "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| two keywords, no Category | 1.38 | 257 | no | "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| a broad keyword and a common Tag | 5.98 | 1077 | no | "question_tags_tagId_questionId_idx", "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| a broad keyword and a rare Tag | 2.55 | 898 | no | "question_tags_tagId_questionId_idx", question_tags_pkey, questions_pkey |
| a narrow keyword and a common Tag | 2.37 | 1072 | no | "question_tags_tagId_questionId_idx", "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| a broad keyword and two Categories | 7.50 | 1118 | no | "question_tags_tagId_questionId_idx", "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| a broad keyword, a deep page | 6.79 | 1053 | no | "questions_authorId_idx", question_tags_pkey, questions_pkey, questions_published_search_idx |
| a broad keyword, as the Author | 5.60 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, as a Reviewer | 5.48 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |

## The plans

### a broad keyword, no Category

The keyword alone, matching about half the bank. The baseline every other plan is read against.

```
Nested Loop Left Join  (cost=5055.19..5767.69 rows=50 width=337) (actual time=4.304..6.084 rows=50 loops=1)
  Buffers: shared hit=1053
  ->  Nested Loop  (cost=5047.76..5395.23 rows=50 width=305) (actual time=4.208..4.331 rows=50 loops=1)
        Buffers: shared hit=851
        ->  Limit  (cost=5047.48..5047.60 rows=50 width=20) (actual time=4.184..4.194 rows=50 loops=1)
              Buffers: shared hit=701
              ->  Sort  (cost=5047.48..5056.33 rows=3540 width=20) (actual time=4.183..4.188 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=701
                    ->  Bitmap Heap Scan on questions q_1  (cost=38.72..4929.88 rows=3540 width=20) (actual time=0.557..3.508 rows=3884 loops=1)
                          Recheck Cond: ((("searchVector" @@ '''test'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                          Filter: (("searchVector" @@ '''test'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=694
                          Buffers: shared hit=701
                          ->  BitmapOr  (cost=38.72..38.72 rows=3941 width=0) (actual time=0.454..0.455 rows=0 loops=1)
                                Buffers: shared hit=6
                                ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..32.66 rows=3941 width=0) (actual time=0.450..0.450 rows=3884 loops=1)
                                      Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Buffers: shared hit=4
                                ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.004 rows=0 loops=1)
                                      Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                      Buffers: shared hit=2
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.034..0.034 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.019..0.027 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.019 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.012..0.012 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.775 ms
Execution Time: 6.271 ms
```

### a narrow keyword, no Category

The same query aimed at one Question in fifty. The planner should not answer it the same way.

```
Nested Loop Left Join  (cost=57.58..112.92 rows=4 width=337) (actual time=0.475..2.303 rows=50 loops=1)
  Buffers: shared hit=520
  ->  Nested Loop  (cost=50.15..83.13 rows=4 width=305) (actual time=0.400..0.512 rows=50 loops=1)
        Buffers: shared hit=318
        ->  Limit  (cost=49.86..49.87 rows=4 width=20) (actual time=0.386..0.395 rows=50 loops=1)
              Buffers: shared hit=168
              ->  Sort  (cost=49.86..49.87 rows=4 width=20) (actual time=0.386..0.390 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''ubiquit'' & ''languag'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 30kB
                    Buffers: shared hit=168
                    ->  Bitmap Heap Scan on questions q_1  (cost=25.77..49.82 rows=4 width=20) (actual time=0.075..0.331 rows=193 loops=1)
                          Recheck Cond: ((("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                          Filter: (("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=160
                          Buffers: shared hit=168
                          ->  BitmapOr  (cost=25.77..25.77 rows=5 width=0) (actual time=0.049..0.050 rows=0 loops=1)
                                Buffers: shared hit=7
                                ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..21.48 rows=5 width=0) (actual time=0.046..0.047 rows=193 loops=1)
                                      Index Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                      Buffers: shared hit=5
                                ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=1)
                                      Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                      Buffers: shared hit=2
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.035..0.035 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.020..0.028 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.019 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.668 ms
Execution Time: 2.476 ms
```

### two keywords, no Category

Two words are AND-ed, which reaches a smaller part of the bank than either word alone.

```
Nested Loop Left Join  (cost=205.45..729.25 rows=36 width=337) (actual time=0.263..1.221 rows=31 loops=1)
  Buffers: shared hit=257
  ->  Nested Loop  (cost=198.02..461.08 rows=36 width=305) (actual time=0.191..0.269 rows=31 loops=1)
        Buffers: shared hit=131
        ->  Limit  (cost=197.74..197.83 rows=36 width=20) (actual time=0.179..0.185 rows=31 loops=1)
              Buffers: shared hit=38
              ->  Sort  (cost=197.74..197.83 rows=36 width=20) (actual time=0.178..0.181 rows=31 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''migrat'' & ''deadlock'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 27kB
                    Buffers: shared hit=38
                    ->  Bitmap Heap Scan on questions q_1  (cost=25.93..196.81 rows=36 width=20) (actual time=0.102..0.162 rows=31 loops=1)
                          Recheck Cond: ((("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                          Filter: (("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=30
                          Buffers: shared hit=38
                          ->  BitmapOr  (cost=25.93..25.93 rows=40 width=0) (actual time=0.082..0.083 rows=0 loops=1)
                                Buffers: shared hit=7
                                ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..21.62 rows=40 width=0) (actual time=0.078..0.079 rows=31 loops=1)
                                      Index Cond: ("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery)
                                      Buffers: shared hit=5
                                ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=1)
                                      Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                      Buffers: shared hit=2
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..7.30 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=31)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=93
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=31)
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
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.009 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.815 ms
Execution Time: 1.384 ms
```

### a broad keyword and a common Tag

The combined query this ticket exists for: the keyword index and the Tag index are both usable, and the planner has to choose.

```
Nested Loop Left Join  (cost=5172.26..5884.75 rows=50 width=337) (actual time=4.173..5.754 rows=50 loops=1)
  Buffers: shared hit=1077
  ->  Nested Loop  (cost=5164.83..5512.29 rows=50 width=305) (actual time=4.088..4.204 rows=50 loops=1)
        Buffers: shared hit=875
        ->  Limit  (cost=5164.54..5164.67 rows=50 width=20) (actual time=4.066..4.076 rows=50 loops=1)
              Buffers: shared hit=725
              ->  Sort  (cost=5164.54..5167.16 rows=1047 width=20) (actual time=4.065..4.071 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=725
                    ->  Hash Semi Join  (cost=219.96..5129.76 rows=1047 width=20) (actual time=1.206..3.879 rows=1147 loops=1)
                          Hash Cond: (q_1.id = qt."questionId")
                          Buffers: shared hit=725
                          ->  Bitmap Heap Scan on questions q_1  (cost=38.72..4921.03 rows=3540 width=274) (actual time=0.439..2.474 rows=3884 loops=1)
                                Recheck Cond: ((("searchVector" @@ '''test'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                                Filter: (("searchVector" @@ '''test'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Heap Blocks: exact=694
                                Buffers: shared hit=701
                                ->  BitmapOr  (cost=38.72..38.72 rows=3941 width=0) (actual time=0.358..0.359 rows=0 loops=1)
                                      Buffers: shared hit=6
                                      ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..32.66 rows=3941 width=0) (actual time=0.354..0.355 rows=3884 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                      ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=1)
                                            Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                            Buffers: shared hit=2
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                                        Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
                          ->  Hash  (cost=144.23..144.23 rows=2961 width=16) (actual time=0.750..0.751 rows=2962 loops=1)
                                Buckets: 4096  Batches: 1  Memory Usage: 171kB
                                Buffers: shared hit=24
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..144.23 rows=2961 width=16) (actual time=0.023..0.335 rows=2962 loops=1)
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
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=50
Planning Time: 1.020 ms
Execution Time: 5.977 ms
```

### a broad keyword and a rare Tag

The same pair with the selective half swapped onto the Tag, which is where driving from question_tags should start to win.

```
Nested Loop Left Join  (cost=1040.26..1752.75 rows=50 width=337) (actual time=0.689..2.370 rows=50 loops=1)
  Buffers: shared hit=898
  ->  Nested Loop  (cost=1032.83..1380.30 rows=50 width=305) (actual time=0.614..0.734 rows=50 loops=1)
        Buffers: shared hit=696
        ->  Limit  (cost=1032.54..1032.67 rows=50 width=20) (actual time=0.597..0.607 rows=50 loops=1)
              Buffers: shared hit=546
              ->  Sort  (cost=1032.54..1032.69 rows=60 width=20) (actual time=0.596..0.602 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 29kB
                    Buffers: shared hit=546
                    ->  Nested Loop  (cost=12.10..1030.77 rows=60 width=20) (actual time=0.095..0.568 rows=61 loops=1)
                          Buffers: shared hit=546
                          ->  HashAggregate  (cost=11.81..13.50 rows=169 width=16) (actual time=0.078..0.099 rows=180 loops=1)
                                Group Key: qt."questionId"
                                Batches: 1  Memory Usage: 40kB
                                Buffers: shared hit=5
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..11.39 rows=170 width=16) (actual time=0.021..0.040 rows=180 loops=1)
                                      Index Cond: ("tagId" = ANY ('{a239f688-62c1-454f-9378-634fb9996a92}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=5
                          ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..6.11 rows=1 width=274) (actual time=0.002..0.002 rows=0 loops=180)
                                Index Cond: (id = qt."questionId")
                                Filter: (("searchVector" @@ '''test'''::tsquery) AND (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Rows Removed by Filter: 1
                                Buffers: shared hit=541
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                                        Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.032..0.032 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.018..0.026 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.019 rows=5 loops=50)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.003 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.011..0.011 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=50
Planning Time: 1.078 ms
Execution Time: 2.553 ms
```

### a narrow keyword and a common Tag

Selective on the keyword instead, so the two indexes swap roles.

```
Nested Loop Left Join  (cost=75.29..83.34 rows=1 width=337) (actual time=0.726..2.199 rows=46 loops=1)
  Buffers: shared hit=1072
  ->  Nested Loop  (cost=67.86..75.90 rows=1 width=305) (actual time=0.659..0.775 rows=46 loops=1)
        Buffers: shared hit=886
        ->  Limit  (cost=67.58..67.58 rows=1 width=20) (actual time=0.648..0.663 rows=46 loops=1)
              Buffers: shared hit=748
              ->  Sort  (cost=67.58..67.58 rows=1 width=20) (actual time=0.648..0.659 rows=46 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''ubiquit'' & ''languag'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 28kB
                    Buffers: shared hit=748
                    ->  Nested Loop Semi Join  (cost=26.19..67.57 rows=1 width=20) (actual time=0.085..0.628 rows=46 loops=1)
                          Buffers: shared hit=748
                          ->  Bitmap Heap Scan on questions q_1  (cost=25.77..49.81 rows=4 width=274) (actual time=0.066..0.266 rows=193 loops=1)
                                Recheck Cond: ((("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                                Filter: (("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Heap Blocks: exact=160
                                Buffers: shared hit=168
                                ->  BitmapOr  (cost=25.77..25.77 rows=5 width=0) (actual time=0.045..0.046 rows=0 loops=1)
                                      Buffers: shared hit=7
                                      ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..21.48 rows=5 width=0) (actual time=0.042..0.042 rows=193 loops=1)
                                            Index Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                            Buffers: shared hit=5
                                      ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=1)
                                            Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                            Buffers: shared hit=2
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
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
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=46)
        Buffers: shared hit=186
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.024 rows=5 loops=46)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=186
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.017 rows=5 loops=46)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=185
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=46)
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
  Buffers: shared hit=50
Planning Time: 0.861 ms
Execution Time: 2.372 ms
```

### a broad keyword and two Categories

One EXISTS per Category is the shape ADR-0011 chose; this is that shape with the search on top of it.

```
Nested Loop Left Join  (cost=5461.80..6174.30 rows=50 width=337) (actual time=5.547..7.211 rows=50 loops=1)
  Buffers: shared hit=1118
  ->  Nested Loop  (cost=5454.38..5801.84 rows=50 width=305) (actual time=5.458..5.570 rows=50 loops=1)
        Buffers: shared hit=916
        ->  Limit  (cost=5454.09..5454.22 rows=50 width=20) (actual time=5.428..5.439 rows=50 loops=1)
              Buffers: shared hit=766
              ->  Sort  (cost=5454.09..5455.37 rows=510 width=20) (actual time=5.428..5.434 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=766
                    ->  Hash Semi Join  (cost=518.36..5437.15 rows=510 width=20) (actual time=2.448..5.311 rows=553 loops=1)
                          Hash Cond: (qt."questionId" = qt_1."questionId")
                          Buffers: shared hit=766
                          ->  Hash Semi Join  (cost=219.96..5127.14 rows=1047 width=290) (actual time=1.171..3.754 rows=1147 loops=1)
                                Hash Cond: (q_1.id = qt."questionId")
                                Buffers: shared hit=725
                                ->  Bitmap Heap Scan on questions q_1  (cost=38.72..4921.03 rows=3540 width=274) (actual time=0.429..2.461 rows=3884 loops=1)
                                      Recheck Cond: ((("searchVector" @@ '''test'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                                      Filter: (("searchVector" @@ '''test'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                      Heap Blocks: exact=694
                                      Buffers: shared hit=701
                                      ->  BitmapOr  (cost=38.72..38.72 rows=3941 width=0) (actual time=0.348..0.349 rows=0 loops=1)
                                            Buffers: shared hit=6
                                            ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..32.66 rows=3941 width=0) (actual time=0.345..0.345 rows=3884 loops=1)
                                                  Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                                  Buffers: shared hit=4
                                            ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=1)
                                                  Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                                  Buffers: shared hit=2
                                      SubPlan 2
                                        ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                              Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                              Rows Removed by Filter: 2
                                              Buffers: shared hit=1
                                ->  Hash  (cost=144.23..144.23 rows=2961 width=16) (actual time=0.725..0.725 rows=2962 loops=1)
                                      Buckets: 4096  Batches: 1  Memory Usage: 171kB
                                      Buffers: shared hit=24
                                      ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..144.23 rows=2961 width=16) (actual time=0.019..0.332 rows=2962 loops=1)
                                            Index Cond: ("tagId" = ANY ('{59e70e7c-94fe-4a5b-b8c9-abeff1d75f0f}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=24
                          ->  Hash  (cost=237.57..237.57 rows=4866 width=16) (actual time=1.237..1.237 rows=4825 loops=1)
                                Buckets: 8192  Batches: 1  Memory Usage: 291kB
                                Buffers: shared hit=41
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt_1  (cost=0.41..237.57 rows=4866 width=16) (actual time=0.021..0.519 rows=4825 loops=1)
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
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.011..0.011 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.004..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=110
Planning Time: 1.229 ms
Execution Time: 7.497 ms
```

### a broad keyword, a deep page

Where the limit-and-offset ceiling sits: the skipped rows still have to be produced and thrown away.

```
Nested Loop Left Join  (cost=5151.27..5863.76 rows=50 width=337) (actual time=5.070..6.580 rows=50 loops=1)
  Buffers: shared hit=1053
  ->  Nested Loop  (cost=5143.84..5491.31 rows=50 width=305) (actual time=4.993..5.096 rows=50 loops=1)
        Buffers: shared hit=851
        ->  Limit  (cost=5143.56..5143.68 rows=50 width=20) (actual time=4.965..4.973 rows=50 loops=1)
              Buffers: shared hit=701
              ->  Sort  (cost=5138.56..5147.41 rows=3540 width=20) (actual time=4.812..4.903 rows=2050 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 370kB
                    Buffers: shared hit=701
                    ->  Bitmap Heap Scan on questions q_1  (cost=38.72..4929.88 rows=3540 width=20) (actual time=0.520..3.113 rows=3884 loops=1)
                          Recheck Cond: ((("searchVector" @@ '''test'''::tsquery) AND ("publicationState" = 'published'::"PublicationState")) OR ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid))
                          Filter: (("searchVector" @@ '''test'''::tsquery) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=694
                          Buffers: shared hit=701
                          ->  BitmapOr  (cost=38.72..38.72 rows=3941 width=0) (actual time=0.436..0.436 rows=0 loops=1)
                                Buffers: shared hit=6
                                ->  Bitmap Index Scan on questions_published_search_idx  (cost=0.00..32.66 rows=3941 width=0) (actual time=0.432..0.432 rows=3884 loops=1)
                                      Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Buffers: shared hit=4
                                ->  Bitmap Index Scan on "questions_authorId_idx"  (cost=0.00..4.29 rows=1 width=0) (actual time=0.003..0.004 rows=0 loops=1)
                                      Index Cond: ("authorId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                      Buffers: shared hit=2
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = '69bbd00e-30c9-4867-b83d-7256550092b9'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.029..0.029 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.023 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.009..0.016 rows=5 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.632 ms
Execution Time: 6.793 ms
```

### a broad keyword, as the Author

The second check becomes published OR authored by this Viewer, and the Author wrote the whole bulk bank.

```
Nested Loop Left Join  (cost=6144.99..6857.48 rows=50 width=337) (actual time=3.953..5.454 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6137.56..6485.03 rows=50 width=305) (actual time=3.848..3.945 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6137.27..6137.40 rows=50 width=20) (actual time=3.829..3.837 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6137.27..6148.35 rows=4431 width=20) (actual time=3.829..3.833 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 30kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5990.08 rows=4431 width=20) (actual time=0.522..3.184 rows=4933 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '8a9c110e-47ce-4bcf-a1b8-1f4ab6225a62'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.432..0.432 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = '8a9c110e-47ce-4bcf-a1b8-1f4ab6225a62'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=301) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.030..0.030 rows=1 loops=50)
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
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.015..0.015 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.007..0.008 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.603 ms
Execution Time: 5.598 ms
```

### a broad keyword, as a Reviewer

A Reviewer drops the second check entirely (ADR-0013), so this is the widest the query ever gets.

```
Nested Loop Left Join  (cost=6120.32..6832.82 rows=50 width=337) (actual time=3.822..5.318 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6112.89..6460.36 rows=50 width=305) (actual time=3.713..3.819 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6112.61..6112.73 rows=50 width=20) (actual time=3.671..3.680 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6112.61..6123.69 rows=4431 width=20) (actual time=3.670..3.674 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5965.42 rows=4431 width=20) (actual time=0.516..3.048 rows=3928 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: (("clientId" IS NULL) OR (hashed SubPlan 2))
                          Rows Removed by Filter: 1005
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.423..0.423 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = 'b6560387-4fdf-4180-875c-1a9eaa2f0bb7'::uuid)
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
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.012..0.013 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.005..0.005 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.684 ms
Execution Time: 5.477 ms
```
