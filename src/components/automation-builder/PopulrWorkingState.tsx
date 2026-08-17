import { Check, Circle } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';

interface PopulrWorkingStateProps { seconds: number }

/** Observable work only; this never presents model reasoning. */
export default function PopulrWorkingState({ seconds }: PopulrWorkingStateProps) {
  const steps = ['Reading your request', 'Making the change', 'Checking the automation'];
  const active = seconds < 2 ? 0 : seconds < 5 ? 1 : 2;
  return (
    <section role="status" aria-label="Populr is updating the automation" className="motion-safe:animate-in motion-safe:fade-in">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-[#111111]">
        <PairedRevolution size="sm" className="text-[#77716A]" /> Updating automation…
      </div>
      <ol className="space-y-1.5 border-l border-[#E4E0DA] pl-3">
        {steps.map((step, index) => (
          <li key={step} className={`flex items-center gap-2 text-[11.5px] ${index > active ? 'text-[#B0AAA2]' : 'text-[#68635D]'}`}>
            {index < active ? <Check size={12} className="text-[#5F8B18]" /> : index === active ? <Circle size={8} fill="#C5FF3D" className="text-[#73951D]" /> : <Circle size={8} />}
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
