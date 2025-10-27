import { mkdirSync } from "fs";
import { join } from "path";

export type CreatePropjectProps = {
  name: string;
  type: "minimal";
};

export default async function CreateProject(props: CreatePropjectProps) {
  const cwd = join(process.cwd(), props.name);
  mkdirSync(cwd, {
    recursive: true,
  });
  await Bun.$`bun init --yes --minimal ${props.name}`.cwd(cwd);
  await Bun.$`bun add frame-master`.cwd(cwd);
  await Bun.$`bun frame-master init`.cwd(cwd);
  if (props.type == "minimal")
    return console.log(
      `\x1b[32m✅ Successfully created minimal Frame Master project: ${props.name}\x1b[0m`
    );
}
