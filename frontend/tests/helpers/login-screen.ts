import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Types credentials into a rendered login screen and presses the button, the way a
 * Viewer would. Waits for the form first, since the router puts it on screen a moment
 * after the client mounts. */
export async function signInOnScreen(email: string, password: string): Promise<void> {
  const emailField = await screen.findByLabelText("Email");
  if (email !== "") await userEvent.type(emailField, email);
  if (password !== "") await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}
