import { mkdirSync, existsSync, rmdirSync } from "fs";
import { join } from "path";
import { x } from "tar";
import { Readable } from "stream";
import { onVerbose } from "../share";
import prompts from "prompts";

export type CreateProjectProps = {
  name?: string;
  type?: "minimal" | "template";
  template?: string;
};

type GithubReleaseType = {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    user_view_type: string;
    site_admin: boolean;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  immutable: boolean;
  prerelease: boolean;
  created_at: string;
  updated_at: string;
  published_at: string;
  assets: any[];
  tarball_url: string;
  zipball_url: string;
};

const FrameMasterBaseUrl = "https://templates.frame-master-docs.pages.dev";

const gitHubReleaseAPI = (usernameAndRepo: string) =>
  `https://api.github.com/repos/${usernameAndRepo}/releases`;

function fetchReleases(usernameAndRepo: string) {
  const url = gitHubReleaseAPI(usernameAndRepo);
  return fetch(url).then((res) => res.json()) as Promise<GithubReleaseType[]>;
}

export default async function CreateProject(props: CreateProjectProps) {
  let { name, type, template } = props;

  if (!name) {
    const response = await prompts({
      type: "text",
      name: "name",
      message: "What is the name of your project?",
      validate: (value: string) =>
        value.length > 0 ? true : "Project name is required",
    });
    name = response.name;
  }

  if (!name) {
    console.error("Project name is required");
    process.exit(1);
  }

  if (template) type = "template";

  type =
    type ??
    ((
      await prompts({
        type: "select",
        name: "type",
        message: "Select a project type",
        choices: [
          { title: "Minimal (Empty Project)", value: "minimal" },
          { title: "Template (From Community)", value: "template" },
        ],
      })
    ).type as CreateProjectProps["type"]);

  if (type === "template" && !template) {
    const templateResponse = await prompts({
      type: "text",
      name: "template",
      message: "Enter template name (e.g. cloudflare-react-tailwind)",
      validate: (value: string) =>
        value.length > 0 ? true : "Template name is required",
    });
    template = templateResponse.template;
  }

  if (template && type === "template") {
    return await createFromTemplate({ name, type, template });
  }

  const cwd = join(process.cwd(), name);
  mkdirSync(cwd, {
    recursive: true,
  });
  await Bun.$`bun init --yes`.cwd(cwd);
  await Bun.$`bun add frame-master`.cwd(cwd);
  await Bun.$`bun frame-master init`.cwd(cwd);
  if (type == "minimal")
    return console.log(
      [
        `\x1b[32m✅ Successfully created minimal Frame Master project: ${name}\x1b[0m`,
        "cd " + name,
        "Add your plugins in frame-master.config.ts",
        "Run development server with:",
        "\x1b[36mbun frame-master dev\x1b[0m",
      ].join("\n")
    );
}

async function createFromTemplate(props: Required<CreateProjectProps>) {
  const { name, template } = props;
  if (!template) return;

  const parts = template.split("@");
  const templateName = parts[0];
  const version = parts[1];

  if (!templateName) {
    console.error("Invalid template name");
    process.exit(1);
  }

  const cwd = join(process.cwd(), name);

  if (existsSync(cwd)) {
    console.error(`Error: Directory ${name} already exists`);
    process.exit(1);
  }

  onVerbose(() =>
    console.log(`Creating project ${name} from template ${templateName}...`)
  );

  let url = "";
  try {
    if (templateName.startsWith("http")) {
      if (
        templateName.includes("github.com") &&
        !templateName.endsWith(".tar.gz") &&
        !templateName.endsWith(".zip")
      ) {
        const urlObj = new URL(templateName);
        const pathSegments = urlObj.pathname.split("/").filter(Boolean);
        if (pathSegments.length >= 2) {
          const owner = pathSegments[0];
          let repo = pathSegments[1]!;
          if (repo.endsWith(".git")) repo = repo.slice(0, -4);
          url = `https://github.com/${owner}/${repo}/archive/refs/${
            version ? "tags/" + version : "heads/main"
          }.tar.gz`;
        } else {
          url = templateName;
        }
      } else {
        url = templateName;
      }
    } else if (templateName) {
      const fmrequestURL = `${FrameMasterBaseUrl}/api/templates/${templateName}`;
      onVerbose(() =>
        console.log(`Fetching template info from ${fmrequestURL}`)
      );
      const response = await fetch(fmrequestURL);
      onVerbose(() =>
        console.log(`Template info response status:`, response.statusText)
      );
      if (!response.ok) {
        if (response.status === 404)
          throw new Error(
            `Template '${templateName}' not found from API Frame Master templates.`
          );
        else
          throw new Error(
            `Failed to fetch template info: ${response.statusText}`
          );
      }
      const repoUrl = (
        (await response.json().then((data) => data.githubRepoUrl)) as string
      ).trim();

      const releases = await fetchReleases(
        repoUrl.split("github.com/").at(1) as string
      );
      const releaseExists = version
        ? releases.find((release) => release.tag_name == version)?.tarball_url
        : releases.at(0)?.tarball_url;

      if (!releaseExists) {
        console.table([
          ...releases.map((r) => ({
            "release-tags": r.tag_name,
            "release-url": r.url,
          })),
        ]);
        throw new Error("Specified version not found");
      }
      url = releaseExists;
    } else {
      // Fallback for testing or other templates
      console.warn(
        "Template API not connected. Trying to construct GitHub URL..."
      );
      // Assuming the template name is owner/repo if not found in mock
      if (templateName.includes("/")) {
        url = `https://github.com/${templateName}/archive/refs/tags/${
          version || "main"
        }.tar.gz`;
      } else {
        throw new Error(
          `Template '${templateName}' not found. Please use 'owner/repo' format or a valid URL.`
        );
      }
    }
  } catch (e: any) {
    console.error(`Failed to resolve template: ${e.message}`);
    process.exit(1);
  }
  if (!url) {
    throw new Error("Template URL could not be determined");
  }
  mkdirSync(cwd, { recursive: true });

  try {
    onVerbose(() => console.log(`Downloading template from ${url}...`));
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download template: ${response.statusText} (${response.status})`
      );
    }

    const nodeStream = Readable.fromWeb(response.body as any);

    await new Promise((resolve, reject) => {
      nodeStream
        .pipe(
          x({
            C: cwd,
            strip: 1,
          })
        )
        .on("finish", resolve)
        .on("error", reject);
    });

    onVerbose(() => console.log("Installing dependencies..."));
    await Bun.$`bun install`.cwd(cwd);

    onVerbose(() => console.log("Initializing Frame Master..."));
    await Bun.$`bun frame-master init`.cwd(cwd);

    console.log(
      [
        `\x1b[32m✅ Successfully created project from template: ${name}\x1b[0m`,
        `cd ${name}`,
        "Run development server with:",
        "\x1b[36mbun dev\x1b[0m",
      ].join("\n")
    );
  } catch (error) {
    console.error("Failed to create project from template:", error);
    if (existsSync(cwd)) {
      try {
        rmdirSync(cwd);
      } catch {
        // ignore
      }
    }
    process.exit(1);
  }
}
