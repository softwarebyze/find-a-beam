# Find a Beam

Stop flipping through the AISC _Steel Construction Manual_.

**Find a Beam** is a steel design workbench built on the [AISC Shapes Database v16.0](https://www.aisc.org/publications/steel-construction-manual-resources/16th-ed-steel-construction-manual/aisc-shapes-database-v16.0/) (the dataset behind the 16th Edition Manual) and ANSI/AISC 360-22.

Live: https://find-a-beam.netlify.app/

## What it does

| Tool                                                                                                                         | Manual / spec basis                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Shape explorer:** all 2,299 shapes, filter and sort on any of 80+ properties, compare up to four                           | Manual Part 1, Tables 1-1 to 1-15         |
| **Shape pages:** dimensioned to-scale drawings, every property with its definition, B4.1 classification, design strengths    | Part 1, Table B4.1a/b                     |
| **Beam design:** lightest passing section for flexure, shear and deflection, with load combinations, bracing and Cb          | Part 3 (Tables 3-2, 3-10, 3-23), Ch. F, G |
| **Beam diagrams:** 22 support/load cases with shear, moment and deflection                                                   | Table 3-23                                |
| **Column design:** lightest passing section, available strength vs. Lc table and chart                                       | Part 4 (Table 4-1), Ch. E                 |
| **Member check:** tension/compression, biaxial flexure, shear, interaction and B1 amplification, as a printable calc package | Ch. D–H, App. 8                           |
| **Reference:** materials, φ/Ω factors, ASCE 7-22 combinations                                                                | Part 2, §B3, ASCE 7-22 §2.3–2.4           |

Everything honors a global **LRFD/ASD** and **US/SI** switch, page state lives in the URL (designs are shareable links), and every number in a calc report cites its equation.

The AISC 360-22 engine (`src/aisc/`) covers B4.1 classification for every shape family, Chapters D, E (E3–E7), F (F2–F10), G (G2–G6), H (H1, H2) and Appendix 8 B1. It is verified against Manual tabulated values and hand calculations, with sweeps over every shape in the database (`npm test`).

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine verification against Manual tables
npm run build
npm run format     # Prettier
```

Regenerate the shape dataset from the AISC workbook (`data-source/`): `pip install openpyxl && npm run data:shapes`.

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## Disclaimer

Results are for use by qualified engineers and must be independently verified. Shape data © AISC; see the database Readme for terms.
