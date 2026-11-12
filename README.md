# Find a Beam

Stop flipping through the AISC *Steel Construction Manual*.

**Find a Beam** is a steel design workbench built on the [AISC Shapes Database v16.0](https://www.aisc.org/publications/steel-construction-manual-resources/16th-ed-steel-construction-manual/aisc-shapes-database-v16.0/) (the dataset behind the 16th Edition Manual) and ANSI/AISC 360-22.

Live: https://find-a-beam.netlify.app/

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine verification against Manual tables
npm run build
```

Regenerate the shape dataset from the AISC workbook (`data-source/`): `pip install openpyxl && npm run data:shapes`.

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## Disclaimer

Results are for use by qualified engineers and must be independently verified. Shape data © AISC; see the database Readme for terms.
