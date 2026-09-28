import type { CategoryName } from "@iqb/shared";
import { brightwater, fernhill, harbourline } from "../clients/hosted-clients.seed.ts";
import {
  seedCategories,
  type SeedBank,
  type SeedCategory,
  type SeedQuestion,
  type SeedTagReference,
} from "./questions.seed.ts";

/** Added to the demo Tags, which the hosted Questions use too. */
const hostedExtraTags: Record<CategoryName, readonly string[]> = {
  technology: ["java", "go", "aws", "docker", "kubernetes", "css", "git", "redis", "graphql"],
  seniority: ["lead"],
  "question-type": ["debugging", "coding"],
};

export const hostedCategories: readonly SeedCategory[] = seedCategories.map((category) => ({
  ...category,
  tags: [...category.tags, ...hostedExtraTags[category.name]],
}));

const tech = (tag: string): SeedTagReference => ({ category: "technology", tag });
const level = (tag: string): SeedTagReference => ({ category: "seniority", tag });
const kind = (tag: string): SeedTagReference => ({ category: "question-type", tag });

/** Numbered by hand rather than by place in the list, so moving one never changes its
 * id and a re-run never writes it twice. */
function byJohn(
  number: number,
  question: Omit<SeedQuestion, "id" | "authorEmail">,
): SeedQuestion {
  return {
    id: `b0000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    authorEmail: "john.doe@iqb.test",
    ...question,
  };
}

/** Open to everyone: 35 Published and 3 Pending. */
const openQuestions: readonly SeedQuestion[] = [
  byJohn(1, {
    text: "What does the event loop do in JavaScript, and where do promises fit into it?",
    answerNotes:
      "Look for the call stack, the task queue and the microtask queue, and why a resolved " +
      "promise runs before a setTimeout of zero.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("javascript"), tech("node"), level("mid"), kind("conceptual")],
  }),
  byJohn(2, {
    text: "Explain closures with an example you have used in real code.",
    answerNotes:
      "A counter or a memoised function is fine. The real test is whether they can say what " +
      "the closure keeps alive, and why that can leak memory.",
    publicationState: "published",
    provenance: "inherited",
    tags: [tech("javascript"), level("junior"), kind("conceptual")],
  }),
  byJohn(3, {
    text: "When would you use `unknown` instead of `any` in TypeScript?",
    answerNotes:
      "They should say `unknown` forces a check before the value is used, and name a place " +
      "for it, like parsed JSON or the value in a catch block.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("typescript"), level("mid"), kind("conceptual")],
  }),
  byJohn(4, {
    text: "Write a generic function that returns the first item of any array and keeps its type.",
    answerNotes:
      "`function first<T>(items: T[]): T | undefined`. Strong candidates handle the empty " +
      "array without being asked.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("typescript"), level("junior"), kind("coding")],
  }),
  byJohn(5, {
    text: "What is a discriminated union, and how does it help the compiler catch a missed case?",
    answerNotes:
      "Look for a shared literal field, narrowing in a switch, and a `never` check in the " +
      "default branch.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("typescript"), level("senior"), kind("conceptual")],
  }),
  byJohn(6, {
    text: "Why does React need a `key` on list items, and what goes wrong with the array index?",
    answerNotes:
      "Keys let React match items between renders. With the index, a reorder or an insert " +
      "can leave one row's state on another row.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("react"), level("junior"), kind("conceptual")],
  }),
  byJohn(7, {
    text: "A component re-renders far more often than it should. How do you find out why?",
    answerNotes:
      "Good answers open the React Profiler before reaching for memo, and spot new object or " +
      "function props made on every render.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("react"), level("mid"), kind("debugging")],
  }),
  byJohn(8, {
    text: "When is `useEffect` the right tool, and when is it the wrong one?",
    answerNotes:
      "Keeping in step with something outside React is right. Working out state from other " +
      "state, or reacting to a click, is not.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("react"), level("mid"), kind("conceptual")],
  }),
  byJohn(9, {
    text: "Two components far apart in the tree need the same state. What are your options?",
    answerNotes:
      "Lifting state up, context, or a store, with a trade-off for each. Be wary of someone " +
      "who puts everything in a global store.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("react"), level("mid"), kind("practical")],
  }),
  byJohn(10, {
    text: "How does Node.js serve many requests at once on a single thread?",
    answerNotes:
      "Non-blocking I/O and the event loop, plus the libuv thread pool for file and crypto " +
      "work. Bonus if they say what one CPU-heavy task does to everyone else.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("node"), level("mid"), kind("conceptual")],
  }),
  byJohn(11, {
    text: "Memory in your Node.js API keeps growing until the process restarts. How do you find the leak?",
    answerNotes:
      "Heap snapshots taken apart in time and compared. Common causes are caches with no " +
      "limit, listeners never removed, and closures held by long-lived objects.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("node"), level("senior"), kind("debugging")],
  }),
  byJohn(12, {
    text: "How do you handle errors in an Express app so one bad request never crashes the server?",
    answerNotes:
      "One error middleware, async errors reaching it, and a clear plan for unhandled " +
      "rejections. Knowing that Express 5 catches rejected promises is a plus.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("node"), level("mid"), kind("practical")],
  }),
  byJohn(13, {
    text: "What is a database index, and when can adding one make things slower?",
    answerNotes:
      "Faster reads for the right queries. Slower writes, more disk, and little help on a " +
      "column with only a few distinct values.",
    publicationState: "published",
    provenance: "inherited",
    tags: [tech("postgres"), level("junior"), kind("conceptual")],
  }),
  byJohn(14, {
    text: "A query that took 50 ms now takes 5 seconds. Walk me through finding the cause.",
    answerNotes:
      "EXPLAIN ANALYZE first. Then a dropped index, stale statistics, a changed plan or a " +
      "table that grew. Guessing before measuring is a warning sign.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("postgres"), level("senior"), kind("debugging")],
  }),
  byJohn(15, {
    text: "Explain the isolation levels in PostgreSQL and name a bug each one prevents.",
    answerNotes:
      "Read committed, repeatable read and serializable. Strong answers give a real case for " +
      "each, like a lost update or write skew.",
    publicationState: "published",
    provenance: "adapted",
    source: "Designing Data-Intensive Applications, chapter 7",
    tags: [tech("postgres"), level("senior"), kind("conceptual")],
  }),
  byJohn(16, {
    text: "Write a SQL query that returns each customer's most recent order.",
    answerNotes:
      "DISTINCT ON, ROW_NUMBER in a window, or a lateral join all work. Ask which they would " +
      "pick on a large table, and why.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("postgres"), level("mid"), kind("coding")],
  }),
  byJohn(17, {
    text: "What is the difference between a list and a tuple in Python, and when does it matter?",
    answerNotes:
      "One can change and one cannot, only a tuple can be a dict key, and the choice says " +
      "what the data means. A junior who covers those is doing well.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("python"), level("junior"), kind("conceptual")],
  }),
  byJohn(18, {
    text: "What is the GIL, and how does it affect a Python program doing heavy computation?",
    answerNotes:
      "Only one thread runs Python code at a time. Use processes or native code for CPU " +
      "work; threads are still fine for waiting on I/O.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("python"), level("senior"), kind("conceptual")],
  }),
  byJohn(19, {
    text: "Write a Python function that groups a list of words by their first letter.",
    answerNotes:
      "defaultdict or setdefault. Watch how they treat empty strings and upper and lower case.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("python"), level("junior"), kind("coding")],
  }),
  byJohn(20, {
    text: "What is the contract between `equals` and `hashCode` in Java, and what breaks if you ignore it?",
    answerNotes:
      "Equal objects must have equal hash codes, or a HashMap or HashSet stops finding them.",
    publicationState: "published",
    provenance: "adapted",
    source: "Effective Java, 3rd edition, item 11",
    tags: [tech("java"), level("mid"), kind("conceptual")],
  }),
  byJohn(21, {
    text: "How does garbage collection work in the JVM, and how would you notice it hurting a service?",
    answerNotes:
      "Generations and pause times, GC logs, and latency spikes that line up with collections.",
    publicationState: "pending",
    provenance: "original",
    tags: [tech("java"), level("senior"), kind("conceptual")],
  }),
  byJohn(22, {
    text: "Build a worker pool in Go with goroutines and channels.",
    answerNotes:
      "Workers read from a jobs channel and write to a results channel, with a WaitGroup to " +
      "know when they are done. Check that only the sender closes a channel.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("go"), level("mid"), kind("coding")],
  }),
  byJohn(23, {
    text: "How does Go handle errors, and what do you think of that design?",
    answerNotes:
      "Errors as values, wrapping with %w, errors.Is and errors.As. The opinion matters less " +
      "than whether they can back it up.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("go"), level("junior"), kind("conceptual")],
  }),
  byJohn(24, {
    text: "How would you host a static website on AWS so it is fast worldwide and cheap to run?",
    answerNotes:
      "S3 behind CloudFront, HTTPS through ACM, and cache headers. Bonus for keeping the " +
      "bucket private with origin access control.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("aws"), level("mid"), kind("practical")],
  }),
  byJohn(25, {
    text: "When would you choose a Lambda function over a container that runs all the time?",
    answerNotes:
      "Spiky or low traffic and short tasks with no state. Cold starts, time limits and the " +
      "cost at steady high load count against it.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("aws"), level("senior"), kind("conceptual")],
  }),
  byJohn(26, {
    text: "What is the difference between a Docker image and a container?",
    answerNotes:
      "An image is the read-only template. A container is one running copy of it, with its " +
      "own layer it can write to.",
    publicationState: "published",
    provenance: "inherited",
    tags: [tech("docker"), level("junior"), kind("conceptual")],
  }),
  byJohn(27, {
    text: "Your Docker image is 2 GB. How would you make it smaller?",
    answerNotes:
      "Multi-stage builds, a slim base image, a .dockerignore, and leaving the build tools " +
      "out of the final stage.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("docker"), level("mid"), kind("practical")],
  }),
  byJohn(28, {
    text: "A pod is stuck in CrashLoopBackOff. How do you find out why?",
    answerNotes:
      "kubectl describe, and logs with --previous. Then failing probes, missing config or " +
      "secrets, and memory limits.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("kubernetes"), level("mid"), kind("debugging")],
  }),
  byJohn(29, {
    text: "Kubernetes offers liveness and readiness probes. What does each one decide?",
    answerNotes:
      "Liveness restarts a stuck container; readiness takes it out of traffic. A liveness " +
      "check that asks the database takes the whole service down when the database blinks.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("kubernetes"), level("senior"), kind("conceptual")],
  }),
  byJohn(30, {
    text: "How would you centre an element both ways on the page with CSS?",
    answerNotes:
      "Flexbox or grid are expected today. Ask about the case where the element's size is " +
      "not known.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("css"), level("junior"), kind("practical")],
  }),
  byJohn(31, {
    text: "What is specificity in CSS, and how do you stop styles fighting each other in a large app?",
    answerNotes:
      "How specificity is counted, then a system to avoid the fight: CSS modules, utility " +
      "classes, or a naming rule like BEM.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("css"), level("mid"), kind("conceptual")],
  }),
  byJohn(32, {
    text: "What is the difference between git merge and git rebase, and when do you use each?",
    answerNotes:
      "Merge keeps history as it happened; rebase rewrites it into a line. Never rebase a " +
      "branch other people have pulled.",
    publicationState: "published",
    provenance: "inherited",
    tags: [tech("git"), level("junior"), kind("conceptual")],
  }),
  byJohn(33, {
    text: "You pushed a secret to a shared repository an hour ago. What do you do?",
    answerNotes:
      "Rotate the secret first, because it is already out. Then remove it from history and " +
      "tell the team. Only removing it is the wrong answer.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("git"), level("mid"), kind("practical")],
  }),
  byJohn(34, {
    text: "How would you put Redis in front of a database as a cache without serving stale data?",
    answerNotes:
      "Cache-aside, expiry times, and deleting the key on write. Strong answers mention the " +
      "stampede when a busy key expires.",
    publicationState: "pending",
    provenance: "original",
    tags: [tech("redis"), level("mid"), kind("system-design")],
  }),
  byJohn(35, {
    text: "What is the N+1 problem in a GraphQL API, and how do you fix it?",
    answerNotes:
      "A resolver that fetches once per item. Batch the fetches with a DataLoader. Bonus for " +
      "limiting how deep a query may go.",
    publicationState: "published",
    provenance: "original",
    tags: [tech("graphql"), tech("node"), level("senior"), kind("debugging")],
  }),
  byJohn(36, {
    text: "Design a URL shortener that takes 100 million new links a month.",
    answerNotes:
      "How keys are made, where links are stored, a cache for popular links, and which " +
      "redirect code to send. Check they size the storage before picking a database.",
    publicationState: "published",
    provenance: "adapted",
    source: "System Design Interview, Alex Xu, chapter 8",
    tags: [tech("redis"), tech("postgres"), level("senior"), kind("system-design")],
  }),
  byJohn(37, {
    text: "Tell me about a production incident you were part of. What did you change afterwards?",
    answerNotes:
      "Listen for an account that blames no one, and for a lasting change like an alert or a " +
      "test, not only the fix.",
    publicationState: "published",
    provenance: "original",
    tags: [level("senior"), level("lead"), kind("behavioural")],
  }),
  byJohn(38, {
    text: "How do you help a teammate who keeps missing their deadlines?",
    answerNotes:
      "A private talk first, finding out why, and agreeing on something both can check. " +
      "Going straight to the manager is a warning sign.",
    publicationState: "pending",
    provenance: "original",
    tags: [level("lead"), kind("behavioural")],
  }),
];

/** Four per Client, with one or two of each Pending so a Reviewer with a Grant has Client
 * work to review. */
const clientQuestions: readonly SeedQuestion[] = [
  byJohn(39, {
    text: "Harbourline's delivery vans each send their position every 10 seconds. How would you store and serve the latest one?",
    answerNotes:
      "Keep the latest position apart from the history: one in something like Redis, the " +
      "other in a table built for time series. Ask how old history gets dropped.",
    restrictedTo: harbourline,
    publicationState: "published",
    provenance: "original",
    tags: [tech("redis"), tech("postgres"), level("senior"), kind("system-design")],
  }),
  byJohn(40, {
    text: "A driver's app sometimes records a delivery twice after a weak signal. How do you make the update safe to repeat?",
    answerNotes:
      "An idempotency key on each update, checked by the server, and a unique constraint so " +
      "a retry cannot write a second row.",
    restrictedTo: harbourline,
    publicationState: "published",
    provenance: "original",
    tags: [tech("node"), tech("postgres"), level("mid"), kind("practical")],
  }),
  byJohn(41, {
    text: "Plan the route for a van with 30 stops. What do you do when the exact answer takes too long?",
    answerNotes:
      "They should see it is the travelling salesman problem and settle for good enough: " +
      "nearest neighbour plus local swaps, inside a time limit.",
    restrictedTo: harbourline,
    publicationState: "published",
    provenance: "original",
    tags: [tech("python"), level("senior"), kind("coding")],
  }),
  byJohn(42, {
    text: "Warehouse staff at Harbourline must scan parcels with no internet for up to an hour. How would you build the app?",
    answerNotes:
      "Scans stored on the device in a queue, and sent when the connection returns, with a " +
      "rule for two scans of the same parcel that disagree.",
    restrictedTo: harbourline,
    publicationState: "pending",
    provenance: "original",
    tags: [tech("react"), tech("typescript"), level("senior"), kind("system-design")],
  }),
  byJohn(43, {
    text: "Brightwater moves money between accounts. How do you make sure a transfer never takes money out without putting it in?",
    answerNotes:
      "One database transaction, or a double-entry ledger. Strong answers lock both accounts " +
      "in a fixed order so two transfers cannot deadlock.",
    restrictedTo: brightwater,
    publicationState: "published",
    provenance: "original",
    tags: [tech("postgres"), tech("java"), level("senior"), kind("system-design")],
  }),
  byJohn(44, {
    text: "Why should money never be stored as a floating-point number? What would you use instead?",
    answerNotes:
      "Floats cannot hold most decimal amounts exactly, so totals drift. Use whole cents or " +
      "a decimal type.",
    restrictedTo: brightwater,
    publicationState: "published",
    provenance: "original",
    tags: [tech("java"), tech("javascript"), level("junior"), kind("conceptual")],
  }),
  byJohn(45, {
    text: "Brightwater's statements page takes 20 seconds for customers with years of history. How would you speed it up?",
    answerNotes:
      "Measure first. Then paging, an index on account and date, and perhaps a summary table " +
      "per month.",
    restrictedTo: brightwater,
    publicationState: "pending",
    provenance: "original",
    tags: [tech("postgres"), level("mid"), kind("debugging")],
  }),
  byJohn(46, {
    text: "Design login for Brightwater's mobile app so that a stolen phone does not mean a stolen account.",
    answerNotes:
      "Short-lived tokens, refresh tokens tied to the device, biometrics to unlock them, and " +
      "a way for the customer to sign out every device at once.",
    restrictedTo: brightwater,
    publicationState: "pending",
    provenance: "original",
    tags: [tech("typescript"), tech("aws"), level("senior"), kind("system-design")],
  }),
  byJohn(47, {
    text: "In a Fernhill flash sale, 50,000 people try to buy 1,000 items in one minute. How do you avoid overselling?",
    answerNotes:
      "An atomic decrement, in Redis or a guarded SQL update, with a queue in front. Ask what " +
      "happens to a cart that is never paid for.",
    restrictedTo: fernhill,
    publicationState: "published",
    provenance: "original",
    tags: [tech("redis"), tech("go"), level("senior"), kind("system-design")],
  }),
  byJohn(48, {
    text: "Fernhill's product pages are slow on phones. Where would you look first?",
    answerNotes:
      "Measure with Lighthouse or real-user data. Then image sizes, too much JavaScript, " +
      "fonts and layout shift.",
    restrictedTo: fernhill,
    publicationState: "published",
    provenance: "original",
    tags: [tech("react"), tech("css"), level("mid"), kind("debugging")],
  }),
  byJohn(49, {
    text: "Build a search box for Fernhill's catalogue that suggests products as the customer types.",
    answerNotes:
      "Wait for a pause in typing, cancel requests that are out of date, and use a search " +
      "index rather than LIKE. Keyboard support matters too.",
    restrictedTo: fernhill,
    publicationState: "published",
    provenance: "original",
    tags: [tech("react"), tech("typescript"), level("mid"), kind("practical")],
  }),
  byJohn(50, {
    text: "Fernhill wants to move its old monolith onto Kubernetes. What would you move first, and why?",
    answerNotes:
      "Something small with clear edges and little risk, with monitoring in place before the " +
      "move. Not the checkout.",
    restrictedTo: fernhill,
    publicationState: "pending",
    provenance: "original",
    tags: [tech("kubernetes"), tech("docker"), level("lead"), kind("system-design")],
  }),
];

export const hostedQuestions: readonly SeedQuestion[] = [...openQuestions, ...clientQuestions];

export const hostedBank: SeedBank = { categories: hostedCategories, questions: hostedQuestions };
