import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { draftAnswerPayloadSchema } from "../schemas/answerPayload";

const outputPath = resolve(
  import.meta.dir,
  "../../../../docs/schemas/interview-answer-payload.schema.json"
);

const schema = z.toJSONSchema(draftAnswerPayloadSchema);
const generatedSchema = {
  ...schema,
  $id: "https://ai-profiling.local/schemas/interview-answer-payload.schema.json",
  title: "Interview answer payload",
  description:
    "Generated from apps/web/src/schemas/answerPayload.ts. Drafts may be partial; submitted payloads additionally require submittedAt and must pass questionnaire completeness validation.",
  "x-generated-from": "apps/web/src/schemas/answerPayload.ts"
};

await writeFile(outputPath, `${JSON.stringify(generatedSchema, null, 2)}\n`, "utf-8");
console.log(`Generated ${outputPath}`);
