import { mkdirSync, existsSync, rmdirSync } from "fs";
import { join } from "path";
import { x } from "tar";
import { Readable } from "stream";
import { onVerbose, text, select, InvalidValueError } from "../share";
import { platform, tmpdir } from "os";

export type CreateProjectProps = {
  name?: string;
  type?: "minimal" | "template";
  template?: string;
  skipInit?: boolean;
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

const FrameMasterBaseUrl = "https://frame-master.com";

const gitHubReleaseAPI = (usernameAndRepo: string) =>
  `https://api.github.com/repos/${usernameAndRepo}/releases`;

function fetchReleases(usernameAndRepo: string) {
  const url = gitHubReleaseAPI(usernameAndRepo);
  return fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw new Error(
          `GitHub API responded with status ${res.status}: ${res.statusText}`
        );
      }
      return res.json();
    })
    .catch((e) => {
      throw new Error(`Failed to fetch releases from GitHub: ${e.message}`);
    }) as Promise<GithubReleaseType[]>;
}

export default async function CreateProject(props: CreateProjectProps) {
  let { name, type, template, skipInit = false } = props;

  if (!name) {
    const response = text({
      message: "What is the name of your project?",
      validate: (value) =>
        value && value.length > 0
          ? undefined
          : new Error("Project name is required"),
    });
    if (typeof response !== "string") {
      throw new Error("Invalid project name input");
    }
    name = response;
  }

  if (!name) {
    console.error("Project name is required");
    process.exit(1);
  }

  if (template) type = "template";

  const selectType =
    type ??
    select({
      message: "Select a project type",

      options: [
        { label: "Minimal", value: "minimal", hint: "Empty Project" },
        {
          label: "Template",
          value: "template",
          hint: "From Community Templates",
        },
      ],
    });

  if (selectType instanceof InvalidValueError) {
    throw selectType;
  } else if (typeof selectType === "undefined") {
    throw new Error("Project type selection is required");
  } else {
    type = selectType;
  }
  if (type === "template" && !template) {
    const templateResponse = text({
      message: "Enter template name (e.g. cloudflare-react-tailwind)",
      validate: (value) =>
        value && value.length > 0
          ? undefined
          : new Error("Template name is required"),
    });
    template = templateResponse.toString();
  }

  if (template && type === "template") {
    return await createFromTemplate({
      name,
      type,
      template,
      skipInit,
    });
  }
  const cwd = join(process.cwd(), name);
  mkdirSync(cwd, {
    recursive: true,
  });
  if (!skipInit) {
    Bun.spawnSync({ cwd, cmd: ["bun", "init", "--yes"] });
    Bun.spawnSync({ cwd, cmd: ["bun", "add", "frame-master"] });
    Bun.spawnSync({ cwd, cmd: ["bun", "frame-master", "init"] });
  }
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
      const repoUrl = (await response
        .json()
        .then((data) => data.githubRepoUrl)) as string;
      if (!repoUrl) {
        throw new Error(
          `Template '${templateName}' does not have a valid GitHub repository URL.`
        );
      }

      const repoPath = repoUrl.trim().split("github.com/").at(1);
      if (!repoPath) {
        throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
      }

      const releases = await fetchReleases(repoPath);
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

    const system = platform();

    if (system === "win32") {
      if (!Bun.which("tar")) {
        throw new Error(
          "`tar` command not found. Please install tar to proceed."
        );
      }
      const fileName = `template-${Date.now()}.tar.gz`;
      const tmpFilePath = join(tmpdir(), fileName);
      await Bun.write(tmpFilePath, await response.arrayBuffer());
      const extract = Bun.spawnSync({
        cmd: ["tar", "-xf", tmpFilePath, "--strip-components=1", "-C", name],
        stderr: "inherit",
        stdout: "ignore",
      });
      if (extract.exitCode !== 0) {
        throw new Error("Failed to extract template archive using tar.");
      }
      await Bun.file(tmpFilePath).delete();
    } else {
      const nodeStream = Readable.fromWeb(response.body as any);
      await new Promise((resolve, reject) => {
        nodeStream
          .pipe(
            x({
              C: cwd,
              strip: 1,
              p: false,
            })
          )
          .on("finish", resolve)
          .on("error", reject);
      });
    }
    if (!props.skipInit) {
      Bun.spawnSync({ cwd, cmd: ["bun", "install"] });
    }

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
