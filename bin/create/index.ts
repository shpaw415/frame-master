import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { x } from "tar";
import { Readable } from "stream";

export type CreateProjectProps = {
  name: string;
  type: "minimal";
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

export default async function CreateProject(props: CreateProjectProps) {
  if (props.template) {
    return await createFromTemplate(props);
  }

  const cwd = join(process.cwd(), props.name);
  mkdirSync(cwd, {
    recursive: true,
  });
  await Bun.$`bun init --yes`.cwd(cwd);
  await Bun.$`bun add frame-master`.cwd(cwd);
  await Bun.$`bun frame-master init`.cwd(cwd);
  if (props.type == "minimal")
    return console.log(
      [
        `\x1b[32m✅ Successfully created minimal Frame Master project: ${props.name}\x1b[0m`,
        "cd " + props.name,
        "Add your plugins in frame-master.config.ts",
        "Run development server with:",
        "\x1b[36mbun frame-master dev\x1b[0m",
      ].join("\n")
    );
}

async function createFromTemplate(props: CreateProjectProps) {
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

  console.log(`Creating project ${name} from template ${templateName}...`);

  let url = "";
  try {
    if (templateName.startsWith("http")) {
      url = templateName;
    } else if (templateName) {
      const fmrequestURL = `${FrameMasterBaseUrl}/api/templates/${templateName}`;
      const response = await fetch(fmrequestURL);
      if (response.ok) {
        const repoUrl = (
          (await response.json().then((data) => data.githubRepoUrl)) as string
        ).trim();

        const releases = (await (
          await fetch(
            `https://api.github.com/repos/${
              repoUrl.split("github.com/")[1]
            }/releases`
          )
        ).json()) as GithubReleaseType[];

        url = `${
          repoUrl.endsWith("/") ? repoUrl : repoUrl + "/"
        }archive/refs/tags/${version || "main"}.tar.gz`;
        console.log(`Resolved template URL: ${url}`);
      }
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

  mkdirSync(cwd, { recursive: true });

  try {
    console.log(`Downloading template from ${url}...`);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download template: ${response.statusText} (${response.status})`
      );
    }

    // @ts-ignore
    const nodeStream = Readable.fromWeb(response.body);

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

    console.log("Installing dependencies...");
    await Bun.$`bun install`.cwd(cwd);

    console.log("Initializing Frame Master...");
    await Bun.$`bun frame-master init`.cwd(cwd);

    console.log(
      [
        `\x1b[32m✅ Successfully created project from template: ${name}\x1b[0m`,
        `cd ${name}`,
        "Run development server with:",
        "\x1b[36mbun frame-master dev\x1b[0m",
      ].join("\n")
    );
  } catch (error) {
    console.error("Failed to create project from template:", error);
    process.exit(1);
  }
}
