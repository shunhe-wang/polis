"use client";

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function StepProgress({
  currentStep,
  totalSteps,
  stepLabels,
}: StepProgressProps) {
  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-muted">
        <div
          className="h-1 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step label */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Step {currentStep + 1} of {totalSteps}
        </p>
        <p className="text-sm font-medium">{stepLabels[currentStep]}</p>
      </div>
    </div>
  );
}
