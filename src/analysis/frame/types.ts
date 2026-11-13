import type { DesignMethod } from '@/aisc/types';
import type { Combination, LoadSet } from '@/analysis/load-combinations';
import type { MemberReport } from '@/features/member/member-check';

/** All analysis quantities use kip, inch, ksi and radians. +Y up, +rotation CCW. */
export type LoadCase = keyof LoadSet;
export interface FrameNode { id: string; x: number; y: number; restraint: [boolean, boolean, boolean] }
export interface FrameMember {
  id: string; start: string; end: string; shape: string; material: string;
  axis: 'major' | 'minor'; releaseStart: boolean; releaseEnd: boolean;
  Lb: number; K: number;
  /** Optional theoretical alignment-chart K (Appendix 7 assumptions must be assessed). */
  alignment?: { GA: number; GB: number; sway: boolean };
}
export interface NodalLoad { id: string; node: string; case: LoadCase; fx: number; fy: number; mz: number }
export interface MemberLoad {
  id: string; member: string; case: LoadCase; type: 'uniform' | 'point';
  /** Global Cartesian components; uniform = kip/in, point = kip. */
  fx: number; fy: number; position: number;
}
export interface FrameModel { nodes: FrameNode[]; members: FrameMember[]; nodalLoads: NodalLoad[]; memberLoads: MemberLoad[] }
export interface FrameSettings {
  method: DesignMethod; analysis: 'DAM' | 'ELM'; order: 'first' | 'second';
  imperfection: 'notional' | 'geometry'; notional: 'auto' | 'all'; tau: 'iterate' | 'extra-notional';
  subdivisions: number; tolerance: number; maxIterations: number;
}
export const DEFAULT_FRAME_SETTINGS: FrameSettings = {
  method: 'LRFD', analysis: 'DAM', order: 'second', imperfection: 'notional',
  notional: 'auto', tau: 'iterate', subdivisions: 4, tolerance: 1e-7, maxIterations: 60,
};
export interface ForceStation { x: number; axial: number; shear: number; moment: number; ux: number; uy: number }
export interface FrameMemberResult {
  id: string; length: number; endForces: number[]; stations: ForceStation[]; tau: number;
}
export interface FrameCombinationResult {
  combo: Combination; direction: number; status: 'converged' | 'unstable' | 'nonconverged' | 'invalid';
  message?: string; iterations: number; amplification: number; notionalApplied: boolean;
  displacements: Record<string, [number, number, number]>;
  reactions: Record<string, [number, number, number]>;
  members: FrameMemberResult[]; firstOrderDisplacements: Record<string, [number, number, number]>;
}
export interface FrameDesignResult {
  id: string; comboId: string; ratio: number; report?: MemberReport; error?: string;
}
export interface FrameResult {
  combinations: FrameCombinationResult[]; design: FrameDesignResult[]; warnings: string[];
  status: 'complete' | 'incomplete';
}
