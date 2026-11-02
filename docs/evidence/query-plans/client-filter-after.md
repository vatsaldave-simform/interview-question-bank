# Query plans at 10,010 Questions

Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the
deployment: free-tier compute is throttled and shared, so a timing taken there measures
the host's spare capacity rather than the indexing decision it is meant to defend
(ADR-0012).

Measured at 2026-11-02T13:48:51.537Z against PostgreSQL 16.15.

Every statement is the one the client sends, taken from the repository itself rather
than retyped here, so this cannot get out of sync with what ships. The tables are
vacuumed and analysed first, and each plan is the second of two runs, so neither a
cold cache nor a missing visibility map is what gets measured.

| scenario | ms | pages | whole table read | indexes used |
| --- | ---: | ---: | --- | --- |
| a common Client | 2.56 | 1397 | no | "question_clients_clientId_questionId_idx", "questions_createdAt_id_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a rare Client | 4.50 | 1332 | **yes** | "question_clients_clientId_questionId_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a Client on a handful of Questions | 0.32 | 42 | no | "question_clients_clientId_questionId_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| two Clients | 2.01 | 986 | no | "questions_createdAt_id_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a common Client and a common Tag | 3.95 | 3124 | no | "question_clients_clientId_questionId_idx", "question_tags_tagId_questionId_idx", "questions_createdAt_id_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a common Client and a broad keyword | 6.45 | 1344 | no | "question_clients_clientId_questionId_idx", "questions_searchVector_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a rare Client and a broad keyword | 3.70 | 1334 | no | "question_clients_clientId_questionId_idx", "questions_searchVector_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |

## The plans

### a common Client

Matches much of the bank, so walking the newest-first index fills a page quickly. The baseline every other plan is read against.

```
Sort  (cost=1913.27..1913.39 rows=50 width=410) (actual time=2.437..2.441 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 58kB
  Buffers: shared hit=1397
  ->  Nested Loop Left Join  (cost=28.98..1911.86 rows=50 width=410) (actual time=0.148..2.400 rows=50 loops=1)
        Buffers: shared hit=1397
        ->  Nested Loop Left Join  (cost=21.55..1539.40 rows=50 width=378) (actual time=0.086..1.287 rows=50 loops=1)
              Buffers: shared hit=1195
              ->  Nested Loop  (cost=0.86..503.45 rows=50 width=346) (actual time=0.056..0.564 rows=50 loops=1)
                    Buffers: shared hit=898
                    ->  Limit  (cost=0.57..155.82 rows=50 width=24) (actual time=0.048..0.479 rows=50 loops=1)
                          Buffers: shared hit=748
                          ->  Nested Loop Semi Join  (cost=0.57..6564.74 rows=2114 width=24) (actual time=0.047..0.476 rows=50 loops=1)
                                Buffers: shared hit=748
                                ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..3224.38 rows=10004 width=24) (actual time=0.024..0.186 rows=249 loops=1)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Rows Removed by Filter: 6
                                      Buffers: shared hit=249
                                ->  Index Only Scan using "question_clients_clientId_questionId_idx" on question_clients qc  (cost=0.29..0.33 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=249)
                                      Index Cond: (("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98}'::uuid[])) AND ("questionId" = q_1.id))
                                      Heap Fetches: 0
                                      Buffers: shared hit=499
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.001..0.001 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.014..0.014 rows=1 loops=50)
                    Buffers: shared hit=297
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.008..0.008 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=297
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.003..0.004 rows=2 loops=50)
                                Buffers: shared hit=297
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.002..0.002 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.000..0.000 rows=1 loops=98)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=196
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.022..0.022 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.018 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=4 loops=50)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=4 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.008 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.555 ms
Execution Time: 2.564 ms
```

### a rare Client

Matches little of the bank, so walking newest first checks many Questions per match. This is where starting from question_clients should win, if an index lets it.

```
Sort  (cost=2645.09..2645.22 rows=50 width=410) (actual time=4.349..4.354 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 57kB
  Buffers: shared hit=1332
  ->  Nested Loop Left Join  (cost=915.94..2643.68 rows=50 width=410) (actual time=2.836..4.317 rows=50 loops=1)
        Buffers: shared hit=1332
        ->  Nested Loop Left Join  (cost=908.51..2271.23 rows=50 width=378) (actual time=2.777..3.186 rows=50 loops=1)
              Buffers: shared hit=1130
              ->  Nested Loop  (cost=887.81..1235.28 rows=50 width=346) (actual time=2.736..2.838 rows=50 loops=1)
                    Buffers: shared hit=841
                    ->  Limit  (cost=887.53..887.65 rows=50 width=24) (actual time=2.719..2.726 rows=50 loops=1)
                          Buffers: shared hit=691
                          ->  Sort  (cost=887.53..888.04 rows=206 width=24) (actual time=2.718..2.722 rows=50 loops=1)
                                Sort Key: q_1."createdAt" DESC, q_1.id DESC
                                Sort Method: top-N heapsort  Memory: 30kB
                                Buffers: shared hit=691
                                ->  Hash Semi Join  (cost=14.46..880.68 rows=206 width=24) (actual time=0.119..2.686 rows=206 loops=1)
                                      Hash Cond: (q_1.id = qc."questionId")
                                      Buffers: shared hit=691
                                      ->  Seq Scan on questions q_1  (cost=0.00..837.15 rows=10004 width=24) (actual time=0.004..2.083 rows=10004 loops=1)
                                            Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                            Rows Removed by Filter: 6
                                            Buffers: shared hit=687
                                      ->  Hash  (cost=11.89..11.89 rows=206 width=16) (actual time=0.053..0.053 rows=206 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 18kB
                                            Buffers: shared hit=4
                                            ->  Index Only Scan using "question_clients_clientId_questionId_idx" on question_clients qc  (cost=0.29..11.89 rows=206 width=16) (actual time=0.017..0.030 rows=206 loops=1)
                                                  Index Cond: ("clientId" = ANY ('{f8d3234b-7ce0-4454-88ad-079934688d98}'::uuid[]))
                                                  Heap Fetches: 0
                                                  Buffers: shared hit=4
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.002..0.002 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.007..0.007 rows=1 loops=50)
                    Buffers: shared hit=289
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.004..0.004 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=289
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.002..0.003 rows=2 loops=50)
                                Buffers: shared hit=289
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.002..0.002 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.000..0.000 rows=1 loops=94)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=188
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.022..0.022 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.013..0.018 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=4 loops=50)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=4 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.008 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.595 ms
Execution Time: 4.505 ms
```

### a Client on a handful of Questions

The far end of the same line: so few matches that reading the whole join table is cheap however it is indexed.

```
Sort  (cost=183.66..183.67 rows=4 width=410) (actual time=0.200..0.202 rows=2 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 26kB
  Buffers: shared hit=42
  ->  Nested Loop Left Join  (cost=66.09..183.62 rows=4 width=410) (actual time=0.153..0.195 rows=2 loops=1)
        Buffers: shared hit=42
        ->  Nested Loop Left Join  (cost=58.67..153.82 rows=4 width=378) (actual time=0.090..0.109 rows=2 loops=1)
              Buffers: shared hit=32
              ->  Nested Loop  (cost=37.97..70.94 rows=4 width=346) (actual time=0.054..0.057 rows=2 loops=1)
                    Buffers: shared hit=21
                    ->  Limit  (cost=37.68..37.69 rows=4 width=24) (actual time=0.047..0.048 rows=2 loops=1)
                          Buffers: shared hit=15
                          ->  Sort  (cost=37.68..37.69 rows=4 width=24) (actual time=0.046..0.047 rows=2 loops=1)
                                Sort Key: q_1."createdAt" DESC, q_1.id DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=15
                                ->  Nested Loop  (cost=4.65..37.64 rows=4 width=24) (actual time=0.039..0.042 rows=2 loops=1)
                                      Buffers: shared hit=15
                                      ->  HashAggregate  (cost=4.37..4.41 rows=4 width=16) (actual time=0.015..0.017 rows=4 loops=1)
                                            Group Key: qc."questionId"
                                            Batches: 1  Memory Usage: 24kB
                                            Buffers: shared hit=3
                                            ->  Index Only Scan using "question_clients_clientId_questionId_idx" on question_clients qc  (cost=0.29..4.36 rows=4 width=16) (actual time=0.012..0.013 rows=4 loops=1)
                                                  Index Cond: ("clientId" = ANY ('{568712a6-4131-491f-8ba1-9d907ea3f480}'::uuid[]))
                                                  Heap Fetches: 0
                                                  Buffers: shared hit=3
                                      ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..8.31 rows=1 width=24) (actual time=0.005..0.005 rows=0 loops=4)
                                            Index Cond: (id = qc."questionId")
                                            Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                            Rows Removed by Filter: 0
                                            Buffers: shared hit=12
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=346) (actual time=0.004..0.004 rows=1 loops=2)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=6
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.025..0.025 rows=1 loops=2)
                    Buffers: shared hit=11
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.017..0.017 rows=2 loops=2)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=11
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.011..0.012 rows=2 loops=2)
                                Buffers: shared hit=11
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.007..0.007 rows=2 loops=2)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=5
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.002..0.002 rows=1 loops=3)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=6
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.041..0.042 rows=1 loops=2)
              Buffers: shared hit=10
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.031..0.037 rows=3 loops=2)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=10
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.019..0.024 rows=3 loops=2)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=9
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.003 rows=61 loops=2)
                                Buffers: shared hit=2
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.013..0.013 rows=3 loops=2)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=7
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.005..0.006 rows=3 loops=2)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=7
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.014..0.014 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.009..0.010 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.567 ms
Execution Time: 0.319 ms
```

### two Clients

Two Clients OR-ed inside one EXISTS, as two Tags of one Category are.

```
Sort  (cost=1840.71..1840.84 rows=50 width=410) (actual time=1.872..1.876 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 57kB
  Buffers: shared hit=986
  ->  Nested Loop Left Join  (cost=28.98..1839.30 rows=50 width=410) (actual time=0.135..1.841 rows=50 loops=1)
        Buffers: shared hit=986
        ->  Nested Loop Left Join  (cost=21.55..1466.84 rows=50 width=378) (actual time=0.076..0.675 rows=50 loops=1)
              Buffers: shared hit=784
              ->  Nested Loop  (cost=0.86..430.89 rows=50 width=346) (actual time=0.037..0.357 rows=50 loops=1)
                    Buffers: shared hit=513
                    ->  Limit  (cost=0.57..83.27 rows=50 width=24) (actual time=0.023..0.267 rows=50 loops=1)
                          Buffers: shared hit=363
                          ->  Nested Loop Semi Join  (cost=0.57..6861.16 rows=4148 width=24) (actual time=0.022..0.263 rows=50 loops=1)
                                Buffers: shared hit=363
                                ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..3224.38 rows=10004 width=24) (actual time=0.011..0.093 rows=121 loops=1)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Rows Removed by Filter: 6
                                      Buffers: shared hit=120
                                ->  Index Only Scan using question_clients_pkey on question_clients qc  (cost=0.29..0.36 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=121)
                                      Index Cond: ("questionId" = q_1.id)
                                      Filter: ("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98,95910676-9c4c-4ae5-889d-4f58ab68dc69}'::uuid[]))
                                      Rows Removed by Filter: 1
                                      Heap Fetches: 0
                                      Buffers: shared hit=243
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.001..0.001 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.006..0.006 rows=1 loops=50)
                    Buffers: shared hit=271
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.003..0.004 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=271
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.002..0.002 rows=2 loops=50)
                                Buffers: shared hit=271
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.001..0.001 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=85)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=170
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.023..0.023 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.013..0.019 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=4 loops=50)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=4 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.009..0.009 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.586 ms
Execution Time: 2.013 ms
```

### a common Client and a common Tag

One EXISTS for the Client beside one for the Category, the shape ADR-0011 chose.

```
Sort  (cost=2382.18..2382.30 rows=50 width=410) (actual time=3.812..3.817 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 58kB
  Buffers: shared hit=3124
  ->  Nested Loop Left Join  (cost=29.40..2380.77 rows=50 width=410) (actual time=0.159..3.769 rows=50 loops=1)
        Buffers: shared hit=3124
        ->  Nested Loop Left Join  (cost=21.97..2008.31 rows=50 width=378) (actual time=0.104..2.284 rows=50 loops=1)
              Buffers: shared hit=2922
              ->  Nested Loop  (cost=1.27..972.36 rows=50 width=346) (actual time=0.075..1.837 rows=50 loops=1)
                    Buffers: shared hit=2633
                    ->  Limit  (cost=0.99..624.73 rows=50 width=24) (actual time=0.069..1.735 rows=50 loops=1)
                          Buffers: shared hit=2483
                          ->  Nested Loop Semi Join  (cost=0.99..7772.87 rows=623 width=24) (actual time=0.069..1.730 rows=50 loops=1)
                                Buffers: shared hit=2483
                                ->  Nested Loop Semi Join  (cost=0.57..6564.74 rows=2114 width=40) (actual time=0.030..1.448 rows=142 loops=1)
                                      Buffers: shared hit=2056
                                      ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..3224.38 rows=10004 width=24) (actual time=0.010..0.492 rows=684 loops=1)
                                            Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                            Rows Removed by Filter: 6
                                            Buffers: shared hit=687
                                      ->  Index Only Scan using "question_clients_clientId_questionId_idx" on question_clients qc  (cost=0.29..0.33 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=684)
                                            Index Cond: (("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98}'::uuid[])) AND ("questionId" = q_1.id))
                                            Heap Fetches: 0
                                            Buffers: shared hit=1369
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..0.57 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=142)
                                      Index Cond: (("tagId" = ANY ('{64aa4812-a331-4564-b807-9afb759ca0ec}'::uuid[])) AND ("questionId" = q_1.id))
                                      Heap Fetches: 0
                                      Buffers: shared hit=427
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.002..0.002 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.008..0.008 rows=1 loops=50)
                    Buffers: shared hit=289
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.005..0.005 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=289
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.003..0.004 rows=2 loops=50)
                                Buffers: shared hit=289
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.002..0.002 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=94)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=188
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.029..0.029 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.017..0.024 rows=5 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.016 rows=5 loops=50)
                          Hash Cond: (t.id = qt_1."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=5 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.003 rows=5 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.006..0.006 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=100
Planning Time: 0.801 ms
Execution Time: 3.947 ms
```

### a common Client and a broad keyword

The search index and the Client filter can each drive the query, and the planner has to choose, as ADR-0029 found for a Tag.

```
Nested Loop Left Join  (cost=1028.65..2756.39 rows=50 width=414) (actual time=4.765..6.265 rows=50 loops=1)
  Buffers: shared hit=1344
  ->  Nested Loop Left Join  (cost=1021.22..2383.94 rows=50 width=382) (actual time=4.699..5.107 rows=50 loops=1)
        Buffers: shared hit=1142
        ->  Nested Loop  (cost=1000.52..1347.99 rows=50 width=350) (actual time=4.651..4.760 rows=50 loops=1)
              Buffers: shared hit=857
              ->  Limit  (cost=1000.24..1000.36 rows=50 width=20) (actual time=4.616..4.635 rows=50 loops=1)
                    Buffers: shared hit=707
                    ->  Sort  (cost=1000.24..1002.84 rows=1042 width=20) (actual time=4.614..4.630 rows=50 loops=1)
                          Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                          Sort Method: top-N heapsort  Memory: 30kB
                          Buffers: shared hit=707
                          ->  Hash Semi Join  (cost=162.55..965.62 rows=1042 width=20) (actual time=0.805..4.453 rows=1034 loops=1)
                                Hash Cond: (q_1.id = qc."questionId")
                                Buffers: shared hit=707
                                ->  Bitmap Heap Scan on questions q_1  (cost=42.81..816.14 rows=4930 width=274) (actual time=0.409..3.018 rows=4933 loops=1)
                                      Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Heap Blocks: exact=687
                                      Buffers: shared hit=691
                                      ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.348..0.348 rows=4933 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                ->  Hash  (cost=93.30..93.30 rows=2115 width=16) (actual time=0.381..0.381 rows=2115 loops=1)
                                      Buckets: 4096  Batches: 1  Memory Usage: 132kB
                                      Buffers: shared hit=16
                                      ->  Index Only Scan using "question_clients_clientId_questionId_idx" on question_clients qc  (cost=0.29..93.30 rows=2115 width=16) (actual time=0.016..0.171 rows=2115 loops=1)
                                            Index Cond: ("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=16
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.007..0.007 rows=1 loops=50)
              Buffers: shared hit=285
              ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.004..0.004 rows=2 loops=50)
                    Sort Key: cl.name
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=285
                    ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.002..0.003 rows=2 loops=50)
                          Buffers: shared hit=285
                          ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.001..0.001 rows=2 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=101
                          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=92)
                                Index Cond: (id = qc_1."clientId")
                                Buffers: shared hit=184
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.023..0.023 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.019 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.014 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.005..0.005 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=45
Planning Time: 0.658 ms
Execution Time: 6.450 ms
```

### a rare Client and a broad keyword

The same pair with the selective half moved onto the Client.

```
Nested Loop Left Join  (cost=876.95..2604.69 rows=50 width=414) (actual time=2.007..3.554 rows=50 loops=1)
  Buffers: shared hit=1334
  ->  Nested Loop Left Join  (cost=869.52..2232.23 rows=50 width=382) (actual time=1.958..2.435 rows=50 loops=1)
        Buffers: shared hit=1132
        ->  Nested Loop  (cost=848.82..1196.28 rows=50 width=350) (actual time=1.929..2.024 rows=50 loops=1)
              Buffers: shared hit=845
              ->  Limit  (cost=848.53..848.66 rows=50 width=20) (actual time=1.913..1.920 rows=50 loops=1)
                    Buffers: shared hit=695
                    ->  Sort  (cost=848.53..848.79 rows=101 width=20) (actual time=1.912..1.917 rows=50 loops=1)
                          Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                          Sort Method: quicksort  Memory: 31kB
                          Buffers: shared hit=695
                          ->  Hash Semi Join  (cost=57.28..845.18 rows=101 width=20) (actual time=0.436..1.893 rows=96 loops=1)
                                Hash Cond: (q_1.id = qc."questionId")
                                Buffers: shared hit=695
                                ->  Bitmap Heap Scan on questions q_1  (cost=42.81..816.14 rows=4930 width=274) (actual time=0.342..1.538 rows=4933 loops=1)
                                      Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Heap Blocks: exact=687
                                      Buffers: shared hit=691
                                      ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.287..0.287 rows=4933 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                ->  Hash  (cost=11.89..11.89 rows=206 width=16) (actual time=0.049..0.050 rows=206 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 18kB
                                      Buffers: shared hit=4
                                      ->  Index Only Scan using "question_clients_clientId_questionId_idx" on question_clients qc  (cost=0.29..11.89 rows=206 width=16) (actual time=0.015..0.028 rows=206 loops=1)
                                            Index Cond: ("clientId" = ANY ('{f8d3234b-7ce0-4454-88ad-079934688d98}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=4
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.007..0.008 rows=1 loops=50)
              Buffers: shared hit=287
              ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.004..0.004 rows=2 loops=50)
                    Sort Key: cl.name
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=287
                    ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.002..0.003 rows=2 loops=50)
                          Buffers: shared hit=287
                          ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.001..0.001 rows=2 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=101
                          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=93)
                                Index Cond: (id = qc_1."clientId")
                                Buffers: shared hit=186
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.022..0.022 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.018 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.008 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=45
Planning Time: 0.616 ms
Execution Time: 3.698 ms
```
