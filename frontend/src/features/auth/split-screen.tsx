import { StarIcon } from "lucide-react";
import type { ReactNode } from "react";

type SplitScreenProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/** The frame every signed-out screen shares: the brand on one side, the form on the other. */
export function SplitScreen({ title, description, children }: SplitScreenProps) {
  return (
    <main className="bg-form-half grid min-h-svh grid-rows-[auto_1fr] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-rows-1">
      <section className="text-brand-half-foreground flex flex-col justify-between gap-5 overflow-hidden bg-(image:--brand-half) px-5 py-6 md:gap-8 md:px-12 md:py-10">
        <div className="flex items-center gap-3">
          <img src="/simform-logo.svg" alt="Simform" className="h-5 w-auto md:h-6.5" />
          <span className="text-brand-tint text-sm font-semibold">Interview Question Bank</span>
        </div>
        <div className="flex max-w-120 flex-col gap-3.5">
          <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance md:text-4xl lg:text-5xl">
            Better interviews start with{" "}
            <em className="text-brand-tint not-italic">better questions.</em>
          </h1>
          <p className="text-brand-half-muted max-w-[40ch] text-sm md:text-base">
            Search the questions our interviewers have written, checked and rated. Then add your
            own for the next person.
          </p>
        </div>
        <SampleCards />
      </section>
      <section className="flex justify-center px-5 pt-6 pb-8 md:items-center md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

/** A picture of what the bank holds, not a Question in it, so it is hidden from screen readers. */
function SampleCards() {
  const cardClasses =
    "bg-brand-half-card border-brand-half-card-border absolute flex flex-col gap-2.5 rounded-2xl border px-4.5 py-4 shadow-xl";
  return (
    <div aria-hidden="true" className="relative hidden h-52 md:block">
      <div className={`${cardClasses} top-0 left-0 w-[min(380px,92%)]`}>
        <small className="text-brand-tint text-xs">Recently added</small>
        <b className="leading-snug">
          What happens between typing an address into a browser and the page appearing?
        </b>
        <div className="flex flex-wrap gap-1.5">
          {["Networking", "Mid-level", "Concepts"].map((tag) => (
            <span key={tag} className="bg-brand-half-tag rounded-full px-2.5 py-0.5 text-xs font-medium">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className={`${cardClasses} top-30 left-[min(220px,40%)] w-60`}>
        <span className="flex items-center gap-1 text-xs">
          <StarIcon className="fill-brand-action text-brand-action size-3.5" />
          <b>4.6</b> out of 5 from 18 Ratings
        </span>
        <small className="text-brand-tint text-xs">
          Checked by a Reviewer before it is in the bank
        </small>
      </div>
    </div>
  );
}
