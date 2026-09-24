import { editQuestionRequestSchema, type Question, type QuestionTag } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { QuestionForm } from "@/features/questions/question-form";
import { QuestionNotShown } from "@/features/questions/question-not-shown";
import {
  problemsIn,
  refusalOf,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { useEditQuestion, useQuestion } from "@/features/questions/questions.queries";

type EditScreenProps = { questionId: string; onSaved: () => void };

export function EditScreen({ questionId, onSaved }: EditScreenProps) {
  const question = useQuestion(questionId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        to="/questions/$questionId"
        params={{ questionId }}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Back to the Question
      </Link>
      <h1 className="text-2xl font-semibold">Edit the Question</h1>
      {question.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading the Question…
        </p>
      ) : question.isError ? (
        <QuestionNotShown reason={question.error} onRetry={() => void question.refetch()} />
      ) : (
        <EditForm question={question.data} onSaved={onSaved} />
      )}
    </div>
  );
}

const tagKeys = (tags: readonly QuestionTag[]) =>
  new Set(tags.map(({ category, tag }) => `${category}/${tag}`));

function sameTags(one: readonly QuestionTag[], other: readonly QuestionTag[]): boolean {
  const keys = tagKeys(one);
  const otherKeys = tagKeys(other);
  return keys.size === otherKeys.size && [...keys].every((key) => otherKeys.has(key));
}

/** Only what the Viewer changed, so the history records the edit they made rather than
 * every field the form happens to hold. */
function changesIn(draft: QuestionDraft, question: Question) {
  const { text, answerNotes, tags } = draft;
  return {
    ...(text.trim() === question.text ? {} : { text }),
    ...(answerNotes.trim() === question.answerNotes ? {} : { answerNotes }),
    ...(sameTags(tags, question.tags) ? {} : { tags }),
  };
}

function EditForm({ question, onSaved }: { question: Question; onSaved: () => void }) {
  const edit = useEditQuestion(question.id);
  const [problems, setProblems] = useState<DraftProblems>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function submit(draft: QuestionDraft): void {
    const checked = editQuestionRequestSchema.safeParse(changesIn(draft, question));
    if (!checked.success) {
      const found = problemsIn(checked.error.issues);
      setProblems(found);
      // The one refusal that names no field is the schema's own: an edit that names nothing.
      setRefusal(
        Object.keys(found).length === 0
          ? "Nothing has changed. Change something before saving."
          : null,
      );
      return;
    }

    setProblems({});
    setRefusal(null);
    edit.mutate(checked.data, {
      onSuccess: onSaved,
      onError: (reason) => {
        const refused = refusalOf(reason);
        setProblems(refused.problems);
        setRefusal(refused.message);
      },
    });
  }

  return (
    <QuestionForm
      initial={{ text: question.text, answerNotes: question.answerNotes, tags: question.tags }}
      problems={problems}
      refusal={refusal === null ? null : { title: "The Question was not saved", message: refusal }}
      sending={edit.isPending}
      submit={{ label: "Save", sendingLabel: "Saving…" }}
      onSubmit={submit}
    />
  );
}
