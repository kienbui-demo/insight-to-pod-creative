MCP (Model Context Protocol) is used to connect tools and data sources from third\-party systems to an agent. Through MCP, an agent can access standardized tools exposed by external services, such as code hosting, project collaboration, knowledge bases, or internal business systems.

In ModelArk Managed Agents, MCP configuration is divided into two layers:


* Agent definition layer: declares which MCP servers to connect to.

* Session runtime layer: injects the corresponding credentials through vaults to complete authentication.


This separation keeps agent definitions reusable and avoids hard\-coding end\-user keys in agent resources.

<span id="declare-mcp-servers-on-an-agent"></span>
# Declare MCP servers on an agent

When you create an agent, declare MCP servers through the `mcp_servers` array. Each server requires three parameters:


<span aceTableMode="list" aceTableWidth="1,3"></span>
|Parameter |Description |
|---|---|
|`type` |How the MCP server is declared. Currently, all MCP servers are declared by URL, and the value is `url`. |
|`name` |MCP server name, which must be unique in the current agent. Later, `mcp_toolset` references this parameter. |
|`url` |MCP server URL. |


Each `mcp_servers` entry must have a corresponding `mcp_toolset` entry with the same name. Conversely, each `mcp_toolset` must reference a declared MCP server.

The following example attaches a GitHub MCP server to an agent:


<Tabs>
<Tab zoneid="sQGigvu0lg" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHubAssistant",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "mcp_servers": [
      {
        "type": "url",
        "name": "github",
        "url": "https://mcp.example.com/github"
      }
    ],
    "tools": [
      {
        "type": "agent_toolset_20260701"
      },
      {
        "type": "mcp_toolset",
        "mcp_server_name": "github"
      }
    ]
  }'
```



</Tab>
</Tabs>


<span id="control-which-mcp-tools-are-available"></span>
# Control which MCP tools are available

The configuration of `mcp_toolset` is the same as that of built\-in toolsets. It also supports `default_config` and `configs`.

If an MCP server exposes many tools, we recommend disabling all of them first, and then enabling specific tools by allowlist:


<Tabs>
<Tab zoneid="Np6M4Ndk8a" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SimplifiedGitHubAssistant",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "mcp_servers": [
      {
        "type": "url",
        "name": "github",
        "url": "https://mcp.example.com/github"
      }
    ],
    "tools": [
      {
        "type": "mcp_toolset",
        "mcp_server_name": "github",
        "default_config": {
          "enabled": false
        },
        "configs": [
          {
            "name": "list_issues",
            "enabled": true
          },
          {
            "name": "get_issue",
            "enabled": true
          },
          {
            "name": "add_issue_comment",
            "enabled": true
          }
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


If you only want to disable a small number of MCP tools, you can also omit `default_config` and directly set the corresponding tools to `enabled: false` in `configs`.

<span id="inject-mcp-credentials-in-a-session"></span>
# Inject MCP credentials in a session

MCP server authentication is not passed in during the agent definition phase. Instead, credentials in vaults are referenced through `vault_ids` when a session is created. This lets the same agent access external systems on behalf of different end users in different sessions.

See the minimal example below:


<Tabs>
<Tab zoneid="iFrnoL66tI" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "agt_xxxxxx",
    "environment_id": "env_xxxxxx",
    "vault_ids": ["vlt_xxxxxx"]
  }'
```



</Tab>
</Tabs>


For details about how to create vaults, credential types such as `mcp_oauth` / `static_bearer`, and matching rules for multiple vaults, see [Authenticate with vaults](https://docs.byteplus.com/en/docs/ModelArk/2553726).

<span id="constraints-and-recommendations"></span>
# Constraints and recommendations


* In the same agent, `mcp_servers.name` must be unique.

* `mcp_servers` and `mcp_toolset` must correspond to each other. You cannot declare only one of them.

* Do not write end\-user tokens directly into the agent definition. Inject them at the session level through vaults.

* For high\-risk MCP tools, we recommend using `always_ask` together with [Tool permission policies](https://docs.byteplus.com/en/docs/ModelArk/2553720).


<span id="related-documents"></span>
# Related documents


<columns>
<columnsItem zoneid="rqrarf08WS">


<card mode="container" href="/en/docs/ModelArk/2553716" >

**Agent**

An agent is a configuration template that contains basic information, system prompt, and extended capabilities.

</card>




<card mode="container" href="/en/docs/ModelArk/2553717" >

**Skills**

Skills are used to add domain knowledge, operation processes, and best practices to an agent.

</card>



</columnsItem>
<columnsItem zoneid="ANhbLNH2gw">


<card mode="container" href="/en/docs/ModelArk/2553719" >

**Tools**

Tools determine which execution capabilities an agent can call in a session.

</card>




<card mode="container" href="/en/docs/ModelArk/2553720" >

**Tool permission policies**

Tool permission policies are used to control whether tool calls initiated by an agent are executed automatically or paused for confirmation.

</card>



</columnsItem>
</columns>




