Multi\-agent is an advanced capability of ModelArk Managed Agents and one of the agent's extended capabilities: it allows one agent (the orchestrator) to delegate tasks to other agents (sub\-agents), enabling division of labor and collaboration among multiple agents. Through specialized division of labor and parallel execution, it improves both the efficiency and output quality of complex tasks.

This page describes how to configure and use Multi\-agent for an agent.

<span id="multi-agent-configuration-parameters"></span>
# Multi\-agent configuration parameters

For the complete structure of the `multiagent` parameter (`type` / `agents[]` / `agents[].type` / `agents[].id` / `agents[].version`), see the `multiagent` parameter description in [Create agent API](https://docs.byteplus.com/en/docs/ModelArk/2555910).

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>


<div data-tips="true" data-tips-type="tip">An orchestrator agent cannot be selected as a sub\-agent of another agent, to prevent circular delegation.</div>


<span id="prerequisites"></span>
# Prerequisites

Before configuring Multi\-agent, you need to:


1. Have all agents that will serve as sub\-agents already created, with their agent IDs recorded.

2. Have configured each sub\-agent with its own model, system prompt, skills, tools, and other settings.

3. Prepare the agent that will act as the orchestrator.


<span id="configure-multi-agent"></span>
# Configure Multi\-agent

<span id="use-the-console"></span>
## Use the console


1. Go to the [Agent management page](https://console.byteplus.com/ark/region:ark+ap-southeast-1/managed-agent/agents).

2. Select an agent that will act as the orchestrator and click Edit (or create a new agent).

3. In the 04 Capability extensions area on the left, find Multi\-agent and click Add.

4. Select the created sub\-agents from the list. You can add multiple sub\-agents and adjust their order.

5. Describe each sub\-agent's specialty and use cases in the system prompt.

6. Click Save.


<span id="use-the-api"></span>
## Use the API

When creating or updating an agent, pass the `multiagent` configuration to enable Multi\-agent.

<span id="create-the-orchestrator-agent"></span>
### Create the orchestrator agent


<Tabs>
<Tab zoneid="wd5nwyWfdT" title="cURL">
<TabTitle>cURL</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "engineering-lead",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "system": "You are the technical lead, responsible for coordinating the team to complete development tasks. Delegate tasks to suitable team members as needed.",
    "multiagent": {
      "type": "coordinator",
      "agents": [
        {
          "type": "agent",
          "id": "agent-20260702070101-xxxxx"
        },
        {
          "type": "agent",
          "id": "agent-20260702070202-yyyyy"
        },
        {
          "type": "self"
        }
      ]
    }
  }'
```



</Tab>
</Tabs>


Example responses:

```json
{
  "id": "agent-20260702070355-xxxxx",
  "type": "agent",
  "name": "engineering-lead",
  "version": 1,
  "model": {
    "id": "dola-seed-2-1-turbo-260628",
    "speed": "standard"
  },
  "multiagent": {
    "type": "coordinator",
    "agents": [
      {
        "type": "agent",
        "id": "agent-20260702070101-xxxxx"
      },
      {
        "type": "agent",
        "id": "agent-20260702070202-yyyyy"
      },
      {
        "type": "self"
      }
    ]
  },
  "created_at": "2026-07-02T07:03:55Z",
  "updated_at": "2026-07-02T07:03:55Z"
}
```


<span id="update-an-existing-agent"></span>
### Update an existing agent

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>


<div data-tips="true" data-tips-type="tip">The current <code>version</code> value must be included in the update request. The update fails if the version number does not match. A new version is generated when the update succeeds.</div>



<Tabs>
<Tab zoneid="t5uN5GLdEO" title="cURL">
<TabTitle>cURL</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents/{agent_id} \
  -X POST \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 1,
    "multiagent": {
      "type": "coordinator",
      "agents": [
        {
          "type": "agent",
          "id": "agent-20260702070101-xxxxx"
        },
        {
          "type": "agent",
          "id": "agent-20260702070202-yyyyy"
        }
      ]
    }
  }'
```



</Tab>
</Tabs>


<span id="advisor-workflow"></span>
# Advisor workflow

<span id="session-threading-mechanism"></span>
## Session threading mechanism

Multi\-agent uses a session threading mechanism to isolate context:


* **Main thread** : The main session thread where the orchestrator runs and directly interacts with the user.

* **Sub\-thread** : Each delegated sub\-agent runs in an independent sub\-thread with its own conversation history.

* **Thread persistence** : Sub\-threads persist throughout the session lifecycle, so the orchestrator can send follow\-up messages to the same sub\-agent.


<span id="delegation-process"></span>
## Delegation process


1. The user sends a task to the orchestrator.

2. The orchestrator analyzes the task and decides whether to delegate it and to which sub\-agent.

3. The system creates a sub\-thread and starts the sub\-agent.

4. The sub\-agent independently executes the task in the sub\-thread using its own tools and capabilities.

5. After the sub\-agent completes the task, it returns the result to the orchestrator.

6. The orchestrator summarizes the results from all sub\-agents and outputs the final response.


<span id="system-prompt-engineering-techniques"></span>
# System prompt engineering techniques

The orchestrator's system prompt directly affects the quality of task decomposition and delegation. Here are some writing suggestions:

<span id="clarify-the-capability-boundaries-of-sub-agents"></span>
## Clarify the capability boundaries of sub\-agents

Clearly describe each sub\-agent's specialty, strengths, and limitations to help the orchestrator make the right delegation decisions.

```text
You can call the following team members:

[Code reviewer]
- Specialty: Code quality review, architecture design evaluation, security vulnerability detection
- Input: Complete code files or code snippets
- Output: A review report containing a list of issues and improvement suggestions
- Limitations: Feature development, writing new code

[Test engineer]
- Specialty: Unit test writing, test case design, coverage analysis
- Input: Code files + feature requirement description
- Output: Test code files + test report
```


<span id="define-the-collaboration-workflow"></span>
## Define the collaboration workflow

Clearly define the task flow between sub\-agents, including sequential execution, parallel execution, and re\-review conditions.

```text
Workflow:
1. After receiving a development task, first delegate it to the development engineer for implementation
2. After development is complete, delegate it to the code reviewer and test engineer at the same time
3. After receiving the review and test results, aggregate the feedback and pass it to the development engineer for revision.
4. Repeat the process until the requirements are met
5. Finally, delegate it to the documentation engineer to update the documentation
```


<span id="observe-the-execution-process"></span>
# Observe the execution process

You can observe the execution process of Multi\-agent through the event stream:


|Observation dimension |Description |
|---|---|
|**Main thread events** |The orchestrator's reasoning, tool calls, and sub\-agent delegation decisions |
|**Sub\-thread events** |The complete execution of each sub\-agent, viewable independently |
|**Thread status** |The running status of each sub\-thread (running, idle, or terminated) |


In console debug mode, you can use the thread switcher to switch between the main thread and each sub\-thread, and view the complete execution trace of each agent.

For how to use the event stream, see [Session event stream](https://docs.byteplus.com/en/docs/ModelArk/2553725).

<span id="notes"></span>
# Notes

<span id="version-locking"></span>
## Version locking

When the orchestrator is created, the versions of its sub\-agents are locked in. If a sub\-agent is updated to a new version later, the orchestrator does not upgrade automatically. To use the new version, manually update the orchestrator's configuration.

<span id="nesting-restriction"></span>
## Nesting restriction

Multi\-agent currently supports only one level of delegation: orchestrator → sub\-agents. A sub\-agent cannot be configured with Multi\-agent to act as a second\-level orchestrator. Nesting deeper than one level is not supported.

<span id="quantity-restriction"></span>
## Quantity restriction

A single orchestrator can be configured with up to 20 different sub\-agents. However, the orchestrator can call the same sub\-agent multiple times, creating multiple parallel sub\-threads.

<span id="resources-and-billing"></span>
## Resources and billing


* Each sub\-thread independently consumes model tokens and sandbox resources.

* Each sub\-agent is billed separately based on its own model and usage.

* The sandbox environment and file system are shared between the orchestrator and sub\-agents.


For specific billing rules, see [Billing description](https://docs.byteplus.com/en/docs/ModelArk/1544106#ma_billing) for ModelArk Managed Agents.

<span id="related-documents"></span>
# Related documents


<columns>
<columnsItem zoneid="eagZf2P5DY">


<card mode="section" href="/en/docs/ModelArk/2553729" >

<span id="advisor"></span>
#### [Advisor](https://docs.byteplus.com/en/docs/ModelArk/2553729)

Advisor automatically calls a stronger advisor model to provide guidance when the agent encounters difficulties.

</card>




<card mode="section" href="/en/docs/ModelArk/2553731" >

<span id="define-outcome"></span>
#### [Define Outcome](https://docs.byteplus.com/en/docs/ModelArk/2553731)

Outcome allows task acceptance criteria to be defined. The agent then iterates automatically until the criteria are met.

</card>



</columnsItem>
<columnsItem zoneid="oUCcslbGiQ">


<card mode="section" href="/en/docs/ModelArk/2553716" >

<span id="define-agent"></span>
#### [Define agent](https://docs.byteplus.com/en/docs/ModelArk/2553716)

Learn how to create and manage agents, including Multi\\-agent configuration.

</card>



</columnsItem>
</columns>




