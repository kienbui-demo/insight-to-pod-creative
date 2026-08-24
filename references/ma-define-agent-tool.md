Tools determine which execution capabilities an agent can call in a session. ModelArk Managed Agents currently support the following tool types:


* Built\-in toolset: `agent_toolset_20260701`

* Custom tools: `custom`

* Evolution tool: `evolution`

* MCP toolset: `mcp_toolset`


<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>


<div data-tips="true" data-tips-type="tip">Custom tools are suitable for letting the agent call a small number of business functions. The business side receives tool call events, runs the actual business logic, and returns the tool results to the session. For the complete workflow, see <a href="https://docs.byteplus.com/en/docs/ModelArk/2608630">[Basics] How to use custom tools in Managed Agents</a>.</div>


If you need to integrate external system capabilities wrapped according to the MCP protocol, see [MCP](https://docs.byteplus.com/en/docs/ModelArk/2553718).

<span id="supported-tools"></span>
# Supported tools

<span id="built-in-tools"></span>
## Built\-in tools

The built\-in toolset includes the following tools. After you add `agent_toolset_20260701` to an agent, all these tools are enabled by default.


<span aceTableMode="list" aceTableWidth="1,1,3"></span>
|Tool |Configuration name |Description |
|---|---|---|
|Bash |`bash` |Execute Bash commands in the sandbox. |
|Read |`read` |Read files in the sandbox. |
|Write |`write` |Write or overwrite files in the sandbox. |
|Edit |`edit` |Perform string replacement on files. |
|Glob |`glob` |Find files by name. |
|Grep |`grep` |Search text content by regular expression. |
|Web Fetch |`web_fetch` |Fetch content from a specified URL. |
|Web Search |`web_search` |Start a web search.<br><br><div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div><br><br><br><div data-tips="true" data-tips-type="warning">Charged based on the actual number of calls.</div><br> |


Custom tools

Custom tools are declared through `type: "custom"`. Each custom tool requires a name, a purpose description, and an input parameter schema. The business side is responsible for receiving the `agent.custom_tool_use` event, running the business logic, and returning the result through `user.custom_tool_result`.

For detailed declaration methods, event flows, and multimedia scenario examples, see [[Basics] How to use custom tools in Managed Agents](https://docs.byteplus.com/en/docs/ModelArk/2608630).

<span id="evolution-tools"></span>
## Evolution tools

`evolution` is a special tool type used to hold configuration for an agent's evolution capabilities. Currently, `evolution` includes only one tool: `advisor`.

`evolution` mainly supports the following configuration structure:


* `configs[].name`

* `configs[].enabled`


In the console, the advisor switch corresponds to `configs[].enabled`.`evolution` / `advisor` does not support manually configuring `permission_policy`.

We currently recommend adding `advisor` to `configs` as an explicit configuration item, so that you can later extend configuration at tool granularity.

See the example below:


<Tabs>
<Tab zoneid="xoRh2Zy69G" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "EvolvingAgent",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701"
      },
      {
        "type": "evolution",
        "configs": [
          {
            "name": "advisor",
            "enabled": true
          }
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


If you only need to enable the default evolution capabilities, you can keep only `type: "evolution"`; if you need to explicitly control the `advisor` switch, use `configs[].enabled`.

<span id="configure-toolsets"></span>
# Configure toolsets

<span id="enable-the-built-in-toolset"></span>
## Enable the built\-in toolset

If you want the agent to have basic execution capabilities by default, the simplest way is to mount `agent_toolset_20260701` directly when creating the agent:


<Tabs>
<Tab zoneid="ybEQEDjLfc" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CodeAssistant",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701"
      }
    ]
  }'
```



</Tab>
</Tabs>


<span id="disable-some-tools"></span>
## Disable some tools

If you do not want the agent to have certain capabilities, you can disable them by tool name in `configs`:


<Tabs>
<Tab zoneid="iB5o9rsNji" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OfflineDocAssistant",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701",
        "configs": [
          {
            "name": "web_fetch",
            "enabled": false
          },
          {
            "name": "web_search",
            "enabled": false
          }
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


This approach is suitable for scenarios with clear restrictions on web access capabilities.

The code sample is shown below (replace `<tool_name>` with the name of the tool to disable):


<Tabs>
<Tab zoneid="trYLNsZwPC" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DisableSpecifiedTool",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701",
        "configs": [
          {
            "name": "<tool_name>",
            "enabled": false
          }
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


&nbsp;

Enable only a few tools

If you want to allow only the minimum toolset, you can first disable the entire toolset, and then explicitly enable the tools you need:


<Tabs>
<Tab zoneid="mYGV6TEVDY" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ReadOnlyAuditingAgent",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701",
        "default_config": {
          "enabled": false
        },
        "configs": [
          {
            "name": "read",
            "enabled": true
          },
          {
            "name": "glob",
            "enabled": true
          },
          {
            "name": "grep",
            "enabled": true
          }
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


This configuration is suitable for read\-only scenarios such as code review and information retrieval.

<span id="use-with-mcp-tools"></span>
# Use with MCP tools

Built\-in tools provide execution inside the sandbox and general web access capabilities. `evolution` is used to configure agent evolution capabilities, and MCP tools provide third\-party system capabilities. An agent can mount all three at the same time. For example:


* Use `agent_toolset_20260701` to read files, execute commands, and fetch web pages.

* Use `evolution` to enable evolution\-related capabilities such as `advisor`.

* Use `mcp_toolset` to call external systems such as GitHub, Linear, and Slack.


For details about MCP declaration methods and authentication methods, see [MCP](https://docs.byteplus.com/en/docs/ModelArk/2553718).

<span id="tool-permission-policies"></span>
# Tool permission policies

Whether a tool is executed automatically is controlled by the permission policies. Common practices are:


* Use the default auto\-allow behavior for built\-in tools.

* Configure enabling or disabling `advisor` in `evolution` at tool granularity.

* Use default manual confirmation for MCP tools, or auto\-allow only whitelisted tools.


For details, see [Tool permission policy](https://docs.byteplus.com/en/docs/ModelArk/2553720).

<span id="related-documents"></span>
# Related documents


<columns>
<columnsItem zoneid="Q8GScFDPRd">


<card mode="container" href="/en/docs/ModelArk/2553716" >

**Agent**

An agent is a configuration template that contains basic information, system prompt, and extended capabilities.

</card>




<card mode="container" href="/en/docs/ModelArk/2553717" >

**Skills**

Skills are used to add domain knowledge, operation processes, and best practices to an agent.

</card>



</columnsItem>
<columnsItem zoneid="knjGxjyiVp">


<card mode="container" href="/en/docs/ModelArk/2553718" >

**MCP**

MCP (Model Context Protocol) is used to connect tools and data sources from third\\-party systems to an agent.

</card>




<card mode="container" href="/en/docs/ModelArk/2553720" >

**Tool permission policies**

Tool permission policies are used to control whether tool calls initiated by an agent are executed automatically or paused for confirmation.

</card>



</columnsItem>
</columns>




