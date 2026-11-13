/**
 * Lightweight citation plumbing. Kept separate from the PDF machinery so that `SpecRef`
 * does not drag pdf.js into the initial bundle.
 */
import { createContext, useContext } from "react";

export type OpenCitation = (text: string, element: HTMLElement) => void;

export const CitationContext = createContext<OpenCitation | null>(null);

export function useCitationClick(): OpenCitation | null {
  return useContext(CitationContext);
}
