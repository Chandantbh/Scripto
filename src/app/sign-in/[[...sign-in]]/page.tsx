import { SignIn } from "@clerk/nextjs";
import { Metadata } from "next";
import GuestContinueButton from "@/components/app/guest-continue-button";

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Scripto account.',
};

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <SignIn />
      <div className="w-full max-w-sm">
        <GuestContinueButton />
      </div>
    </div>
  );
}
