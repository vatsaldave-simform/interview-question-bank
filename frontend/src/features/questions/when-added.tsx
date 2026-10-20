import { agoWording } from "@/platform/when-wording";

export function WhenAdded({ createdAt }: { createdAt: string }) {
  return (
    <p>
      Added <time dateTime={createdAt}>{agoWording(createdAt)}</time>
    </p>
  );
}
