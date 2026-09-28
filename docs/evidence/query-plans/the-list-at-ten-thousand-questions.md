# Query plans at 10,009 Questions

Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the
deployment: free-tier compute is throttled and shared, so a timing taken there measures
the host's spare capacity rather than the indexing decision it is meant to defend
(ADR-0012).

Measured at 2026-09-28T09:00:23.499Z against PostgreSQL 16.15.

Every statement is the one the list sends, taken from the repository itself rather
than retyped here, so this cannot get out of sync with what ships. The tables are
vacuumed and analysed first, and each plan is the second of two runs, so neither a
cold cache nor a missing visibility map is what gets measured.

| scenario | ms | pages | whole table read | indexes used |
| --- | ---: | ---: | --- | --- |
| no Category | 2.01 | 438 | no | "questions_createdAt_id_idx", clients_pkey, question_tags_pkey, questions_pkey |
| a common Tag | 2.65 | 995 | no | "question_tags_tagId_questionId_idx", "questions_createdAt_id_idx", clients_pkey, question_tags_pkey, questions_pkey |
| a rare Tag | 3.02 | 924 | no | "question_tags_tagId_questionId_idx", clients_pkey, question_tags_pkey, questions_pkey |
| two Categories | 4.24 | 1822 | no | "question_tags_tagId_questionId_idx", "questions_createdAt_id_idx", clients_pkey, question_tags_pkey, questions_pkey |
| a common Tag, a deep page | 9.28 | 9288 | no | "question_tags_tagId_questionId_idx", clients_pkey, question_tags_pkey, questions_pkey |
| no Category, as the Author | 2.05 | 434 | no | "questions_createdAt_id_idx", clients_pkey, question_tags_pkey, questions_pkey |
| no Category, as a Reviewer | 2.01 | 425 | no | "questions_createdAt_id_idx", clients_pkey, question_tags_pkey, questions_pkey |

## The plans

### no Category

The whole bank a Reader sees. The baseline every other plan is read against, and the query that can stop earliest.

```
Sort  (cost=1206.60..1206.73 rows=50 width=410) (actual time=1.871..1.876 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 51kB
  Buffers: shared hit=438
  ->  Nested Loop Left Join  (cost=8.00..1205.19 rows=50 width=410) (actual time=0.115..1.824 rows=50 loops=1)
        Buffers: shared hit=438
        ->  Nested Loop  (cost=0.57..424.24 rows=50 width=362) (actual time=0.034..0.196 rows=50 loops=1)
              Buffers: shared hit=202
              ->  Limit  (cost=0.29..76.61 rows=50 width=24) (actual time=0.024..0.081 rows=50 loops=1)
                    Buffers: shared hit=52
                    ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..13715.78 rows=8985 width=24) (actual time=0.023..0.076 rows=50 loops=1)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 3)))
                          Rows Removed by Filter: 7
                          Buffers: shared hit=52
                          SubPlan 3
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.031..0.031 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.017..0.025 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.018 rows=4 loops=50)
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
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.009 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=34
Planning:
  Buffers: shared hit=20
Planning Time: 0.538 ms
Execution Time: 2.011 ms
```

### a common Tag

One Category, matching much of the bank, so walking the ordering index still pays.

```
Sort  (cost=1482.50..1482.63 rows=50 width=410) (actual time=2.499..2.505 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 53kB
  Buffers: shared hit=995
  ->  Nested Loop Left Join  (cost=8.41..1481.09 rows=50 width=410) (actual time=0.255..2.452 rows=50 loops=1)
        Buffers: shared hit=995
        ->  Nested Loop  (cost=0.98..700.14 rows=50 width=362) (actual time=0.080..0.623 rows=50 loops=1)
              Buffers: shared hit=757
              ->  Limit  (cost=0.70..352.51 rows=50 width=24) (actual time=0.070..0.506 rows=50 loops=1)
                    Buffers: shared hit=607
                    ->  Nested Loop Semi Join  (cost=0.70..18963.20 rows=2695 width=24) (actual time=0.069..0.501 rows=50 loops=1)
                          Buffers: shared hit=607
                          ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..13715.78 rows=8985 width=24) (actual time=0.026..0.173 rows=151 loops=1)
                                Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 3)))
                                Rows Removed by Filter: 7
                                Buffers: shared hit=153
                                SubPlan 3
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                        Filter: ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
                          ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..0.58 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=151)
                                Index Cond: (("tagId" = ANY ('{02787ecb-e940-45f1-b936-bf3a45d73023}'::uuid[])) AND ("questionId" = q_1.id))
                                Heap Fetches: 0
                                Buffers: shared hit=454
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.035..0.035 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.020..0.028 rows=5 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.013..0.021 rows=5 loops=50)
                          Hash Cond: (t.id = qt_1."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.010..0.010 rows=5 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.003 rows=5 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.009..0.010 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=36
Planning:
  Buffers: shared hit=48
Planning Time: 0.778 ms
Execution Time: 2.653 ms
```

### a rare Tag

One Category, matching little of the bank, which is where ADR-0011 found the planner drives from question_tags instead.

```
Sort  (cost=2203.94..2204.07 rows=50 width=410) (actual time=2.803..2.809 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 52kB
  Buffers: shared hit=924
  ->  Nested Loop Left Join  (cost=1081.54..2202.53 rows=50 width=410) (actual time=0.916..2.760 rows=50 loops=1)
        Buffers: shared hit=924
        ->  Nested Loop  (cost=1074.11..1421.57 rows=50 width=362) (actual time=0.809..0.915 rows=50 loops=1)
              Buffers: shared hit=696
              ->  Limit  (cost=1073.82..1073.95 rows=50 width=24) (actual time=0.792..0.801 rows=50 loops=1)
                    Buffers: shared hit=546
                    ->  Sort  (cost=1073.82..1074.22 rows=160 width=24) (actual time=0.790..0.796 rows=50 loops=1)
                          Sort Key: q_1."createdAt" DESC, q_1.id DESC
                          Sort Method: top-N heapsort  Memory: 31kB
                          Buffers: shared hit=546
                          ->  Nested Loop  (cost=12.26..1068.51 rows=160 width=24) (actual time=0.118..0.728 rows=180 loops=1)
                                Buffers: shared hit=546
                                ->  HashAggregate  (cost=11.97..13.74 rows=177 width=16) (actual time=0.099..0.124 rows=180 loops=1)
                                      Group Key: qt."questionId"
                                      Batches: 1  Memory Usage: 40kB
                                      Buffers: shared hit=5
                                      ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..11.53 rows=178 width=16) (actual time=0.023..0.047 rows=180 loops=1)
                                            Index Cond: ("tagId" = ANY ('{6546d227-7b79-4adc-8685-b76f37191e84}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=5
                                ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..6.05 rows=1 width=24) (actual time=0.003..0.003 rows=1 loops=180)
                                      Index Cond: (id = qt."questionId")
                                      Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 3)))
                                      Buffers: shared hit=541
                                      SubPlan 3
                                        ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                                              Filter: ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)
                                              Rows Removed by Filter: 2
                                              Buffers: shared hit=1
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.035..0.035 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.019..0.028 rows=5 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.012..0.020 rows=5 loops=50)
                          Hash Cond: (t.id = qt_1."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.004 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.009..0.009 rows=5 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.003 rows=5 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.020..0.021 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=26
Planning:
  Buffers: shared hit=48
Planning Time: 1.035 ms
Execution Time: 3.017 ms
```

### two Categories

One EXISTS per Category, which is the shape ADR-0011 chose.

```
Sort  (cost=1932.42..1932.54 rows=50 width=410) (actual time=4.023..4.030 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 53kB
  Buffers: shared hit=1822
  ->  Nested Loop Left Join  (cost=8.83..1931.01 rows=50 width=410) (actual time=0.329..3.971 rows=50 loops=1)
        Buffers: shared hit=1822
        ->  Nested Loop  (cost=1.40..1150.05 rows=50 width=362) (actual time=0.184..1.610 rows=50 loops=1)
              Buffers: shared hit=1596
              ->  Limit  (cost=1.11..802.43 rows=50 width=24) (actual time=0.167..1.449 rows=50 loops=1)
                    Buffers: shared hit=1446
                    ->  Nested Loop Semi Join  (cost=1.11..20562.74 rows=1283 width=24) (actual time=0.166..1.441 rows=50 loops=1)
                          Join Filter: (qt."questionId" = qt_1."questionId")
                          Buffers: shared hit=1446
                          ->  Nested Loop Semi Join  (cost=0.70..18963.20 rows=2695 width=40) (actual time=0.109..1.162 rows=91 loops=1)
                                Buffers: shared hit=1172
                                ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..13715.78 rows=8985 width=24) (actual time=0.048..0.385 rows=292 loops=1)
                                      Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 3)))
                                      Rows Removed by Filter: 7
                                      Buffers: shared hit=295
                                      SubPlan 3
                                        ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.007..0.008 rows=1 loops=1)
                                              Filter: ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)
                                              Rows Removed by Filter: 2
                                              Buffers: shared hit=1
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..0.58 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=292)
                                      Index Cond: (("tagId" = ANY ('{02787ecb-e940-45f1-b936-bf3a45d73023}'::uuid[])) AND ("questionId" = q_1.id))
                                      Heap Fetches: 0
                                      Buffers: shared hit=877
                          ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt_1  (cost=0.41..0.58 rows=1 width=16) (actual time=0.002..0.002 rows=1 loops=91)
                                Index Cond: (("tagId" = ANY ('{e4cda90b-2f83-4491-89a7-693cf6f6229b}'::uuid[])) AND ("questionId" = q_1.id))
                                Heap Fetches: 0
                                Buffers: shared hit=274
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.045..0.045 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.024..0.035 rows=5 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.015..0.025 rows=5 loops=50)
                          Hash Cond: (t.id = qt_2."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.005 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.011..0.011 rows=5 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt_2  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.004 rows=5 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.024..0.024 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.006..0.007 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=24
Planning:
  Buffers: shared hit=108
Planning Time: 2.059 ms
Execution Time: 4.243 ms
```

### a common Tag, a deep page

Where ADR-0011 found the limit-and-offset ceiling: the skipped rows still have to be produced and thrown away. One Tag, because two match too few Questions to reach the page.

```
Sort  (cost=7199.05..7199.18 rows=50 width=410) (actual time=8.999..9.006 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 52kB
  Buffers: shared hit=9288
  ->  Nested Loop Left Join  (cost=6076.65..7197.64 rows=50 width=410) (actual time=7.258..8.958 rows=50 loops=1)
        Buffers: shared hit=9288
        ->  Nested Loop  (cost=6069.22..6416.69 rows=50 width=362) (actual time=7.148..7.247 rows=50 loops=1)
              Buffers: shared hit=9062
              ->  Limit  (cost=6068.94..6069.06 rows=50 width=24) (actual time=7.130..7.141 rows=50 loops=1)
                    Buffers: shared hit=8912
                    ->  Sort  (cost=6063.94..6070.67 rows=2695 width=24) (actual time=6.956..7.065 rows=2050 loops=1)
                          Sort Key: q_1."createdAt" DESC, q_1.id DESC
                          Sort Method: quicksort  Memory: 305kB
                          Buffers: shared hit=8912
                          ->  Nested Loop  (cost=156.74..5910.37 rows=2695 width=24) (actual time=0.959..6.110 rows=2962 loops=1)
                                Buffers: shared hit=8912
                                ->  HashAggregate  (cost=156.45..183.19 rows=2674 width=16) (actual time=0.945..1.240 rows=2962 loops=1)
                                      Group Key: qt."questionId"
                                      Batches: 1  Memory Usage: 241kB
                                      Buffers: shared hit=25
                                      ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..148.95 rows=3002 width=16) (actual time=0.029..0.356 rows=2962 loops=1)
                                            Index Cond: ("tagId" = ANY ('{02787ecb-e940-45f1-b936-bf3a45d73023}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=25
                                ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..2.47 rows=1 width=24) (actual time=0.001..0.001 rows=1 loops=2962)
                                      Index Cond: (id = qt."questionId")
                                      Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 3)))
                                      Buffers: shared hit=8887
                                      SubPlan 3
                                        ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                                              Filter: ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid)
                                              Rows Removed by Filter: 2
                                              Buffers: shared hit=1
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.033..0.033 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.018..0.026 rows=5 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.018 rows=5 loops=50)
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
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.015..0.016 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.006..0.007 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=24
Planning:
  Buffers: shared hit=48
Planning Time: 0.788 ms
Execution Time: 9.283 ms
```

### no Category, as the Author

The second check becomes published OR authored by this Viewer, and the Author wrote the whole bulk bank.

```
Sort  (cost=1206.56..1206.69 rows=50 width=410) (actual time=1.925..1.930 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 50kB
  Buffers: shared hit=434
  ->  Nested Loop Left Join  (cost=8.00..1205.15 rows=50 width=410) (actual time=0.103..1.884 rows=50 loops=1)
        Buffers: shared hit=434
        ->  Nested Loop  (cost=0.57..424.19 rows=50 width=362) (actual time=0.029..0.240 rows=50 loops=1)
              Buffers: shared hit=198
              ->  Limit  (cost=0.29..76.57 rows=50 width=24) (actual time=0.019..0.063 rows=50 loops=1)
                    Buffers: shared hit=48
                    ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..13715.78 rows=8990 width=24) (actual time=0.018..0.059 rows=50 loops=1)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '22ed73ea-999f-4852-876b-893313367b90'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 3)))
                          Rows Removed by Filter: 3
                          Buffers: shared hit=48
                          SubPlan 3
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.002..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = '22ed73ea-999f-4852-876b-893313367b90'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.031..0.031 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.017..0.025 rows=4 loops=50)
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
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.007 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.001..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.001..0.001 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=34
Planning:
  Buffers: shared hit=20
Planning Time: 0.473 ms
Execution Time: 2.050 ms
```

### no Category, as a Reviewer

A Reviewer drops the second check entirely (ADR-0013).

```
Sort  (cost=1206.28..1206.41 rows=50 width=410) (actual time=1.870..1.875 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 49kB
  Buffers: shared hit=425
  ->  Nested Loop Left Join  (cost=8.00..1204.87 rows=50 width=410) (actual time=0.121..1.829 rows=50 loops=1)
        Buffers: shared hit=425
        ->  Nested Loop  (cost=0.57..423.91 rows=50 width=362) (actual time=0.033..0.198 rows=50 loops=1)
              Buffers: shared hit=217
              ->  Limit  (cost=0.29..76.29 rows=50 width=24) (actual time=0.023..0.085 rows=50 loops=1)
                    Buffers: shared hit=67
                    ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..13665.73 rows=8990 width=24) (actual time=0.022..0.081 rows=50 loops=1)
                          Filter: (("clientId" IS NULL) OR (hashed SubPlan 3))
                          Rows Removed by Filter: 22
                          Buffers: shared hit=67
                          SubPlan 3
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = 'f4343a6b-7b06-4b86-89a2-f399ddff36eb'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.031..0.031 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.017..0.025 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.018 rows=4 loops=50)
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
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.009..0.009 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
        SubPlan 1
          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=32) (actual time=0.000..0.000 rows=0 loops=50)
                Index Cond: (id = q."clientId")
                Buffers: shared hit=6
Planning:
  Buffers: shared hit=20
Planning Time: 0.528 ms
Execution Time: 2.011 ms
```
