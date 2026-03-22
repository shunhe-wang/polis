"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepProgress } from "@/components/onboarding/step-progress";
import { IssueRater } from "@/components/onboarding/issue-rater";
import { PolicySignalSelector } from "@/components/onboarding/policy-signal-selector";
import { FreeTextInput } from "@/components/onboarding/free-text-input";
import { IdentitySelector } from "@/components/onboarding/identity-selector";
import {
  type Issue,
  type PolicySignal,
  type PoliticalIdentity,
  type ValuesProfile,
  createEmptyValuesProfile,
} from "@/lib/types";
import { safeSessionStorageSet } from "@/lib/browser-storage";
import { saveValuesProfile } from "@/lib/persistence";

const STEP_LABELS = [
  "Rate Issues",
  "Policy Leanings",
  "Your Priorities",
  "Identity",
];
const TOTAL_STEPS = STEP_LABELS.length;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ValuesProfile>(
    createEmptyValuesProfile
  );

  const handleRatingChange = useCallback((issue: Issue, value: number) => {
    setProfile((prev) => ({
      ...prev,
      issueRatings: { ...prev.issueRatings, [issue]: value },
    }));
  }, []);

  const handleFreeTextChange = useCallback((value: string) => {
    setProfile((prev) => ({ ...prev, freeText: value }));
  }, []);

  const handlePolicySignalChange = useCallback(
    (signal: PolicySignal, value: ValuesProfile["policySignals"][PolicySignal]) => {
      setProfile((prev) => ({
        ...prev,
        policySignals: { ...prev.policySignals, [signal]: value },
      }));
    },
    []
  );

  const handleIdentityChange = useCallback(
    (value: PoliticalIdentity | null) => {
      setProfile((prev) => ({ ...prev, politicalIdentity: value }));
    },
    []
  );

  const canAdvance = (): boolean => {
    switch (step) {
      case 0:
        // Issue ratings always have defaults, so always valid
        return true;
      case 1:
        // Policy signals are optional
        return true;
      case 2:
        // Free text is optional
        return true;
      case 3:
        // Identity is optional
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      // Save profile to sessionStorage and navigate to ballot input
      const saved = safeSessionStorageSet(
        "valuesProfile",
        JSON.stringify(profile)
      );
      if (!saved) {
        setStorageError(
          "Could not save your profile in this browser. Free up browser storage and try again."
        );
        return;
      }
      // Also persist to Supabase for logged-in users (fire-and-forget)
      saveValuesProfile(profile);
      router.push("/ballot");
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Your Values Profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Help us understand what matters to you so we can match candidates to
            your priorities.
          </p>
        </div>

        {/* Progress */}
        <StepProgress
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
        />

        {/* Step content */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            {storageError && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                {storageError}
              </div>
            )}
            {step === 0 && (
              <IssueRater
                ratings={profile.issueRatings}
                onRatingChange={handleRatingChange}
              />
            )}
            {step === 1 && (
              <PolicySignalSelector
                value={profile.policySignals}
                onChange={handlePolicySignalChange}
              />
            )}
            {step === 2 && (
              <FreeTextInput
                value={profile.freeText}
                onChange={handleFreeTextChange}
              />
            )}
            {step === 3 && (
              <IdentitySelector
                value={profile.politicalIdentity}
                onChange={handleIdentityChange}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 0}
          >
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canAdvance()}>
            {step === TOTAL_STEPS - 1 ? "Continue to Ballot" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}
