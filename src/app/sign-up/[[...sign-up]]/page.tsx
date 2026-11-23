import { SignUp } from "@clerk/nextjs";
import { Metadata } from "next";
import GuestContinueButton from "@/components/app/guest-continue-button";

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create a new Scripto account.',
};

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <SignUp />
      <div className="w-full max-w-sm">
        <GuestContinueButton />
      </div>
    </div>
  );
}
