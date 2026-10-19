import { Link } from "@tanstack/react-router";
import { Button } from "@/ui/shadcn/button";

export function AddAQuestionButton() {
  return (
    <Button asChild>
      <Link to="/questions/new">Add a Question</Link>
    </Button>
  );
}
