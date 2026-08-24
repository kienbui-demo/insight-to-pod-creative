This topic describes how to create a cloud sandbox environment for ModelArk Managed Agents.

You need to create an environment to describe the configuration used by the agent at runtime. When creating a session, you can reference the environment to use through its environment ID.

One environment configuration can be reused by multiple sessions, but each session starts its own sandbox instance and the file system state is isolated.

<span id="create-an-environment"></span>
## Create an environment

Create an environment on the [Environments](https://console.byteplus.com/ark/region:ark+ap-southeast-1/managed-agents/environments) page in the console or programmatically.

> When creating an environment, it is recommended to use a clear and unique name so that different environments can be distinguished easily within an organization or workspace.


Use the following example to create an environment through the API:

```bash
environment=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/environments" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<'EOF'
{
  "name": "<ENVIRONMENT_NAME>",
  "config": {
    "type": "cloud",
    "networking": {
      "type": "unrestricted"
      },
    "packages": {
      "pip": ["pandas"],
      "apt": ["curl"]
    },
    "env": {
      "MY_KEY_0": "value_0",
      "MY_KEY_1": "value_1"
    }
  }
}
EOF
)

ENVIRONMENT_ID=$(jq -er '.id' <<<"$environment")

echo "Environment ID: $ENVIRONMENT_ID"
```


Configuration items:


* `name`: Must be unique.

* `description`: Description of the environment.

* `config.type`: Currently only cloud environments are supported. The value is `cloud`.

* `config.networking.type`: Outbound network access setting for the sandbox. The value is `unrestricted`, which allows full outbound network access, still subject to the general security blocklist.

* `config.packages`: Specifies dependency packages to preinstall at startup. Dependencies are cached across sessions that use the same environment. If multiple package managers are configured, they are executed in alphabetical order by package manager name: `apt`, `cargo`, `gem`, `go`, `npm`, `pip`. Package versions can be specified explicitly. If no version is specified, the latest version is installed by default. The supported package managers are as follows.

   
   |Field |Package manager |Example |
   |---|---|---|
   |`apt` |System packages (`apt-get`) |`"ffmpeg"` |
   |`cargo` |Rust (`cargo`) |`"ripgrep@14.0.0"` |
   |`gem` |Ruby (`gem`) |`"rails:7.1.0"` |
   |`go` |Go modules |`"golang.org/x/tools/cmd/goimports@latest"` |
   |`npm` |Node.js (`npm`) |`"express@4.18.0"` |
   |`pip` |Python (`pip`) |`"pandas==2.2.0"` |
   

* Set environment variables to inject under `config.env`.


<span id="specify-an-environment-for-a-session"></span>
## Specify an environment for a session

After creating an environment, specify the environment ID when creating a session. The environment defines the sandbox template, while the session represents a single Agent run.

```bash
session=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "agent": "$AGENT_ID",
  "environment_id": "$ENVIRONMENT_ID",
  "title": "Quickstart session"
}
EOF
)

SESSION_ID=$(jq -er '.id' <<<"$session")

echo "Session ID: $SESSION_ID"
```


<span id="environment-lifecycle"></span>
## Environment lifecycle


* Multiple sessions can reference the same environment, but each session gets an independent sandbox instance.

* File system state is not shared across sessions.

* Environments themselves are not versioned. If you update environment configurations frequently, it is recommended to track changes in your own system so you can identify which version of the environment a given session used.


<span id="manage-environments"></span>
## Manage environments

You can list, retrieve, update, or delete Environments.

```bash
# List environments
environments=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/environments" \
    -H "Authorization: Bearer $ARK_API_KEY"
)

# Retrieve a specific environment
environment=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/environments/$ENVIRONMENT_ID" \
    -H "Authorization: Bearer $ARK_API_KEY"
)

# Update environment description
environment=$(
  curl -sS --fail-with-body -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/environments/$ENVIRONMENT_ID" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<'EOF'
{
  "description": "<UPDATED_ENVIRONMENT_DESC>"
}
EOF
)

# Delete an environment (only if no sessions reference it)
curl -sS --fail-with-body -X DELETE \
  "https://ark.ap-southeast.bytepluses.com/api/v3/environments/$ENVIRONMENT_ID" \
  -H "Authorization: Bearer $ARK_API_KEY"
```


<span id="preinstalled-runtimes"></span>
## Preinstalled runtimes

The cloud sandbox includes common language runtimes, databases, and tools by default. To confirm specific built\-in versions or view the full list, see [Cloud sandbox reference](https://docs.byteplus.com/en/docs/ModelArk/2553722).



