ModelArk Managed Agents is a fully managed agent service launched by ModelArk, providing an out\-of\-the\-box agent experience. An agent, the basic component of ModelArk Managed Agents, is a configuration template that includes basic information, system prompt, and extended capabilities such as skills, tools, and MCP. It can be reused by any session and supports version management. This document explains how to define an agent.

<span id="agent-definition-parameters"></span>
# Agent definition parameters

For the complete agent parameter definitions (including name, model, system prompt, skills, tools, MCP, multi\-agent collaboration, metadata, and more), see [Create agent](https://docs.byteplus.com/en/docs/ModelArk/2555910).

<span id="prerequisites"></span>
# Prerequisites


1. Get the API keyThe API key is authentication information for calling ModelArk models and services.

   Go to the [API keys page](https://ai.byteplus.com/ark/region:ap-southeast-1/apiKey) and create your API key.

2. (Recommended) Configure environment variables. The API key is sensitive information. If it is accidentally leaked, it may cause financial loss or security risks. Therefore, we strongly recommend that you do not write the API key in plaintext in your code. Configure it in environment variables instead.

   Replace `your_api_key_here` in the following command with your API key, and run the command in the terminal to configure the API key in an environment variable. For details, see [Environment variable configuration guide](https://docs.byteplus.com/en/docs/ModelArk/1820161).

   
   <Tabs>
   <Tab zoneid="QlXL39AlXm" title="macOS">
   <TabTitle>macOS</TabTitle>
   
   ```Bash
   export ARK_API_KEY="your_api_key_here"
   ```
   
   
   
   </Tab>
   <Tab zoneid="LaF8cbPHRj" title="Linux">
   <TabTitle>Linux</TabTitle>
   
   ```Bash
   export ARK_API_KEY="your_api_key_here"
   ```
   
   
   
   </Tab>
   <Tab zoneid="NJippwQ5B7" title="Windows_CMD">
   <TabTitle>Windows_CMD</TabTitle>
   
   ```CMD
   setx ARK_API_KEY "your_api_key_here"
   ```
   
   
   
   </Tab>
   <Tab zoneid="IyPXns3Nfi" title="Windows_PowerShell">
   <TabTitle>Windows_PowerShell</TabTitle>
   
   ```PowerShell
   $env:ARK_API_KEY = "your_api_key_here"
   ```
   
   
   
   </Tab>
   </Tabs>
   

3. Activate the Managed Agents service.

   Go to the [Model activation page](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement), switch to the **Managed Agents** tab, and activate the service.

4. Activate the model service.

   Go to the [Model activation page](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement) to activate the model service.


<span id="create-an-agent"></span>
# Create an agent

After you create an agent, the API returns a permanent agent ID and the initial version number `1`. When you create a session later, you can directly reference this agent ID.

The following example creates a trending news agent with a built\-in toolset and a custom skill:

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "X-Ark-Beta: agentic-2026-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NewsAgent01",
    "model": {
      "id": "dola-seed-2-1-turbo-260628",
      "speed": "standard"
    },
    "description": "A helper that summarizes trending news into images.",
    "system": "You are a trending news search and summary assistant. You can summarize the top 10 trending news items each day as a summary image.",
    "skills": [
      {
        "type": "custom",
        "skill_id": "skill-20260812080348-****"
      }
    ],
    "tools": [
      {
        "type": "agent_toolset_20260701"
      }
    ]
  }'
```


Here, `skill-20260812080348-****` indicates the `skill_id` obtained after you upload a custom skill.

Example response:

```json
{
  "id": "agent-20260812081435-*****",
  "type": "agent",
  "name": "NewsAgent01",
  "description": "A helper that summarizes trending news into images.",
  "version": 1,
  "model": {
    "id": "dola-seed-2-1-turbo-260628",
    "speed": "standard"
  },
  "system": "You are a trending news search and summary assistant. You can summarize the top 10 trending news items each day as a summary image.",
  "tools": [
    {
      "type": "agent_toolset_20260701",
      "default_config": {
        "enabled": true
      }
    }
  ],
  "skills": [
    {
      "type": "custom",
      "skill_id": "skill-20260812080348-****"
    }
  ],
  "created_at": "2026-08-12T08:14:35Z",
  "updated_at": "2026-08-12T08:14:35Z"
}
```


<span id="update-an-agent-and-its-versions"></span>
# Update an agent and its versions

An agent is a versioned resource. Each time you update the configuration, you must explicitly pass the current version number. If the version number does not match, the update fails. After the update succeeds, the system generates a new version.

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">Tip</div>


<div data-tips="true" data-tips-type="tip">Replace <code>{agent_id}</code> in the following code sample with the agent ID to update.</div>


```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents/{agent_id} \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "X-Ark-Beta: agentic-2026-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 2,
    "system": "You are a trending news search and summary assistant. You can summarize the top 10 trending news items each day as a summary image and audio.",
    "skills": [
      {
        "type": "custom",
        "skill_id": "skill-20260812075208-****"
      },
      {
        "type": "custom",
        "skill_id": "skill-20260729084811-****"
      }
    ]
  }'
```


Example response:

```json
{
  "id": "agent-20260812081435-*****",
  "type": "agent",
  "name": "NewsAgent01",
  "description": "A helper that summarizes trending news into images.",
  "version": 2,
  "model": {
    "id": "dola-seed-2-1-turbo-260628",
    "speed": "standard"
  },
  "system": "You are a trending news search and summary assistant. You can summarize the top 10 trending news items each day as a summary image and audio.",
  "tools": [
    {
      "type": "agent_toolset_20260701",
      "default_config": {
        "enabled": true
      }
    }
  ],
  "skills": [
    {
      "type": "custom",
      "skill_id": "skill-20260812075208-****"
    },
    {
      "type": "custom",
      "skill_id": "skill-20260729084811-****"
    }
  ],
  "created_at": "2026-08-12T08:14:35Z",
  "updated_at": "2026-08-12T08:25:21Z"
}
```


When updating an agent, we recommend that you follow these rules:


* The update request must include the current `version`.

* A new agent version is generated after the configuration is modified.

* If some parameters remain unchanged, you can pass only the parameters that need to be modified. For example, when you update only `system`, you do not need to pass `tools` again.

* `skills` uses overwrite logic. Once `skills` is passed in the request body, the system uses this array to overwrite the current `skills` configuration of the agent as a whole. It does not append the array to the existing configuration.

* If you only want to add or adjust a skill, you must first read the current `skills` of the agent, and then write "skills to keep + new skills" back to the request body together.


<span id="design-tips"></span>
# Design tips


* Put stable capabilities in the agent, and put one\-time tasks in session events.

* `system` should define only roles, constraints, and long\-term rules. Do not write the current task directly into `system`.

* When you need external system capabilities, use MCP first.

* When you need to reuse domain knowledge or execution specifications, mount skills first instead of putting long operation manuals directly into `system`.


<span id="related-documents"></span>
# Related documents


<columns>
<columnsItem zoneid="JUcqkvrh1R">


<card mode="container" href="/en/docs/ModelArk/2553717" >

**Skills**

Skills are used to add domain knowledge, operation processes, and best practices to an agent.

</card>




<card mode="container" href="/en/docs/ModelArk/2553718" >

**MCP**

MCP (Model Context Protocol) is used to connect tools and data sources from third\\-party systems to an agent.

</card>



</columnsItem>
<columnsItem zoneid="YU9l4XaidW">


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




