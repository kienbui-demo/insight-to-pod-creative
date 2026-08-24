Managed Agents (MA) supports built\-in tools, custom tools, and MCP tools. For tool types and basic configuration, see [Tools](https://docs.byteplus.com/en/docs/ModelArk/2553719).

Built\-in tools are suitable for operations such as file reading and writing, command execution, and web search in a managed sandbox. Custom tools are suitable for letting the agent call a small number of business functions. MCP tools are suitable for accessing external capabilities that have already been packaged according to the MCP protocol.

In enterprise applications, developers usually also need the agent to call dedicated operations in business systems, such as querying orders, creating tickets, calling inventory systems, accessing internal risk control APIs, or triggering existing enterprise image, video, and data processing services. If these capabilities are all accessed through an MCP server, you need to deploy additional services and maintain HTTP endpoints and authentication links. If the agent directly calls internal interfaces through the command line, there is no stable parameter schema, permission boundary, or result format constraint.

Custom tools are suitable for letting the agent call a small number of business functions. Developers only need to declare the tool name, purpose, and input schema in the agent. At runtime, the business side receives tool call events, executes the actual business logic, and returns the tool results to the session. The agent can continue reasoning and replying to the user based on the tool results.

This topic describes the general access process for custom tools and uses four multimedia examples to show how to declare tools, trigger calls, and return results:


* Generate images with custom tools

* Return multiple images as Base64

* Generate a video with a File ID as the reference asset

* Query a video task and understanding video content


<span id="prerequisites"></span>
## Prerequisites

You need to prepare:


* Managed Agents has been activated, and a usable API key has been obtained.

* The model used by the agent has been activated.

* The business operations to expose to the agent have been defined, including the operation name, purpose, input parameters, returned results, and error handling method.

* Business\-side execution logic has been prepared. This logic can run on your server, internal system, or task queue to receive tool call events, perform actual operations, and return tool results to the session.

* If the tool needs to access internal systems, configure authentication, access control, audit logs, and timeout policies in advance.


<span id="procedure"></span>
## Procedure

The general process for using custom tools are as follows:


1. **Declare the tool** : When creating an agent, add a tool with `type: custom` to `tools`, and enter `name`, `description`, and `input_schema`.

2. **Create a session** : Create a session based on the agent.

3. **Send a user message** : Send `user.message` to the session.

4. **Receive a tool call event** : When the agent determines that it needs to call a custom tool, an `agent.custom_tool_use` event appears in the session event stream. This event contains the tool name, tool input parameters, and event ID.

5. **Wait for the session to pause** : The session then enters the `idle` state and sends a `session.status_idle` event. The `stop_reason.type` of this event is `requires_action`, and `stop_reason.event_ids` contains the event IDs that need to be processed by the business side.

6. **Execute business logic** : The business side performs the corresponding operation based on the `name` and `input` of `agent.custom_tool_use`.

7. **Return tool results** : The business side sends a `user.custom_tool_result` event and uses `custom_tool_use_id` to associate it with the tool call event ID in step 4.

8. **Continue running** : After all blocking events are processed, the session switches from `idle` back to `running`, and the agent continues generating a reply based on the tool results.


If `stop_reason.event_ids` contains multiple event IDs, a result needs to be returned for each blocking event. We recommend sending multiple `user.custom_tool_result` events for the same round of blocking events in the same `events` array.

<span id="declare-custom-tools"></span>
## Declare custom tools

Custom tools are declared through the `tools` parameter of the agent. Each tool contains at least the following parameters:


|Parameter |Type |Description |
|---|---|---|
|`type` |String |Fixed to `custom`. |
|`name` |String |Tool name. We recommend using English letters, numbers, underscores, or hyphens so that the model can reference the tool reliably. |
|`description` |String |Tool purpose, applicable conditions, and limitations. The model determines when to call the tool based on this description. |
|`input_schema` |Object |The JSON Schema of the tool input parameters. Used to constrain the tool input parameters generated by the model. |


When declaring a tool, we recommend following these principles:


* Clearly state in `description` when the tool should be used and when it should not be used.

* In `input_schema`, expose only the parameters required by the business, and do not expose sensitive configurations such as API keys or internal service addresses.

* Clearly constrain enum values, numeric ranges, required parameters, and `additionalProperties`.

* Keep tool return values structured so that the agent can determine whether the operation succeeded, whether a retry is needed, and how to explain the result to the user.


The following example response shows only key parameters related to the process. The actual response parameters are subject to the API response.

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/agents" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CustomToolDemo",
    "model": {
      "id": "seed-2-0-lite-260228"
    },
    "system": "You are an assistant that can call business tools. Call the declared custom tool when external business capabilities are needed. Do not fabricate tool results.",
    "tools": [
      {
        "type": "custom",
        "name": "query_order",
        "description": "Query the order status by order ID. Use only when the user requests order information.",
        "input_schema": {
          "type": "object",
          "properties": {
            "order_id": {
              "type": "string",
              "description": "Order ID."
            }
          },
          "required": ["order_id"],
          "additionalProperties": false
        }
      }
    ]
  }'
```


Response example:

```json
{
  "id": "agent-20260729153010-****",
  "object": "agent",
  "created_at": 1785310210,
  "name": "CustomToolDemo",
  "model": {
    "id": "seed-2-0-lite-260228"
  }
}
```


<span id="create-a-session"></span>
## Create a session

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "agent-20260729153010-****",
    "environment_id": "env-20260729152900-****",
    "title": "custom tools demo"
  }'
```


Response example:

```json
{
  "id": "sesn-20260729153122-****",
  "object": "session",
  "agent": "agent-20260729153010-****",
  "environment_id": "env-20260729152900-****",
  "status": "idle"
}
```


<span id="example-1-generate-images-with-custom-tools"></span>
## Example 1: generate images with custom tools

This example shows how to access an existing enterprise image generation service through custom tools. The complete process includes declaring the `generate_image` tool, creating an agent and a session, sending a user message, receiving a tool call event, executing image generation logic, and returning image results.

When creating an agent, declare the image generation tool in `tools`:

```json
{
  "type": "custom",
  "name": "generate_image",
  "description": "Call the business-side image generation service to generate images. Use it when the user explicitly requests creating, drawing, or generating images. Do not use it to answer plain-text questions. The prompt must describe the subject, scene, style, and key constraints. size determines the output size. n determines the number of returned images.",
  "input_schema": {
    "type": "object",
    "properties": {
      "prompt": {
        "type": "string",
        "description": "The complete image generation prompt."
      },
      "size": {
        "type": "string",
        "description": "Output size, such as 2048x2048."
      },
      "watermark": {
        "type": "boolean",
        "description": "Whether to add a watermark."
      },
      "n": {
        "type": "integer",
        "minimum": 1,
        "maximum": 4,
        "description": "The number of returned images."
      }
    },
    "required": ["prompt"],
    "additionalProperties": false
  }
}
```


After creating an agent that contains this tool and creating a session, send an image generation request:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.message",
        "content": [
          {
            "type": "text",
            "text": "Generate a 2048x2048 product poster: a transparent glass coffee cup on a wooden tabletop, morning natural light, shallow-depth-of-field green plants in the background, and a clean commercial photography style."
          }
        ]
      }
    ]
  }'
```


The model generates `agent.custom_tool_use`:

```json
{
  "id": "evt-20260729153201-****",
  "type": "agent.custom_tool_use",
  "name": "generate_image",
  "input": {
    "prompt": "A transparent glass coffee cup on a wooden tabletop, morning natural light, shallow-depth-of-field green plants in the background, clean commercial photography style, product poster composition",
    "size": "2048x2048",
    "watermark": true,
    "n": 1
  }
}
```


Then the session enters the `requires_action` state:

```json
{
  "id": "evt-20260729153202-****",
  "type": "session.status_idle",
  "status": "idle",
  "stop_reason": {
    "type": "requires_action",
    "event_ids": [
      "evt-20260729153201-****"
    ]
  }
}
```


The business\-side executor calls the image generation service and returns the tool result:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.custom_tool_result",
        "custom_tool_use_id": "evt-20260729153201-****",
        "is_error": false,
        "content": [
          {
            "type": "text",
            "text": "{\"ok\":true,\"image_count\":1,\"delivery\":\"base64\",\"request_id\":\"req-20260729153215-****\",\"usage\":{\"generated_images\":1}}"
          },
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA...****"
            }
          }
        ]
      }
    ]
  }'
```


After the model receives the result, it can reply to the user, for example:

```json
{
  "type": "agent.message",
  "content": [
    {
      "type": "text",
      "text": "The image has been generated. It is a product poster of a glass coffee cup in morning natural light."
    }
  ]
}
```


<span id="example-2-return-multiple-images-as-base64"></span>
## Example 2: Return multiple images as Base64

This example demonstrates a tool call that returns multiple multimodal content blocks. You can reuse the `generate_image` tool declaration from example 1, but you need to set a reasonable range for `n` in `input_schema`, such as `minimum: 1` and `maximum: 4`.

After creating an agent and session that include this tool, the user can request that multiple images be generated at once:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.message",
        "content": [
          {
            "type": "text",
            "text": "Generate 3 e-commerce base images for a smart speaker, showing the front view, a 45-degree angle, and a usage scenario."
          }
        ]
      }
    ]
  }'
```


An example tool call event generated by the agent is as follows:

```json
{
  "id": "evt-20260729154001-****",
  "type": "agent.custom_tool_use",
  "name": "generate_image",
  "input": {
    "prompt": "3 e-commerce base images of a smart speaker, white background, soft shadows, showing the front view, a 45-degree angle, and a usage scenario",
    "size": "2048x2048",
    "watermark": true,
    "n": 3
  }
}
```


When returning the result, put only a machine\-readable summary in the text block and do not insert Base64 again. Use a separate `image/base64` content block for each image:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.custom_tool_result",
        "custom_tool_use_id": "evt-20260729154001-****",
        "is_error": false,
        "content": [
          {
            "type": "text",
            "text": "{\"ok\":true,\"image_count\":3,\"delivery\":\"base64\",\"request_ids\":[\"req-20260729154011-****\",\"req-20260729154018-****\",\"req-20260729154025-****\"],\"usage\":{\"generated_images\":3}}"
          },
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA...image_1...****"
            }
          },
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA...image_2...****"
            }
          },
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA...image_3...****"
            }
          }
        ]
      }
    ]
  }'
```


This structure has two benefits:


* Text JSON makes it easy for the agent to determine whether the tool succeeded, how many images were generated, and whether a retry is needed.

* Native `image` content blocks make it easy for the model to directly consume the image modality, without parsing large Base64 strings from text.


<span id="example-3-generate-a-video-from-a-file-id-reference"></span>
## Example 3: generate a video from a File ID reference

This example shows how to let a custom tool receive a File ID, and how the business side parses the file into a reference asset that the video generation service can read. This applies to scenarios where assets such as reference images, reference videos, and reference audio have already been uploaded through the Files API.

When creating an agent, declare the `generate_video` tool:

```json
{
  "type": "custom",
  "name": "generate_video",
  "description": "Submit an asynchronous video generation task. Use this when the user requests video generation, video generation based on reference assets, or image-to-video generation. A successful call only means the task has been submitted; use get_video_task to query the completion status.",
  "input_schema": {
    "type": "object",
    "properties": {
      "prompt": {
        "type": "string",
        "description": "Video prompt, describing the subject, action, scene, camera shot, and style."
      },
      "model": {
        "type": "string",
        "description": "Video generation model ID or endpoint ID."
      },
      "reference_image_sources": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["url", "file", "tos"]
            },
            "url": {
              "type": "string"
            },
            "file_id": {
              "type": "string"
            },
            "tos_uri": {
              "type": "string"
            }
          },
          "required": ["type"],
          "additionalProperties": false
        },
        "description": "List of reference image sources."
      },
      "duration": {
        "type": "integer",
        "description": "Video duration, in seconds."
      },
      "ratio": {
        "type": "string",
        "description": "Aspect ratio, for example 16:9, 9:16, or 1:1."
      },
      "wait_for_completion": {
        "type": "boolean",
        "description": "Whether to wait for the task to complete before returning the tool result."
      }
    },
    "additionalProperties": false
  }
}
```


After creating an agent and session that include this tool, the user can reference the File ID in a message:

User request:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.message",
        "content": [
          {
            "type": "text",
            "text": "Use the reference image file-20260729160108-**** to generate a 5-second 16:9 video: steam slowly rises beside the cup, the camera pushes in slightly, with warm morning light."
          }
        ]
      }
    ]
  }'
```


The model calls `generate_video`:

```json
{
  "id": "evt-20260729160130-****",
  "type": "agent.custom_tool_use",
  "name": "generate_video",
  "input": {
    "model": "dreamina-seedance-2-0-260128",
    "prompt": "Keep the cup in the reference image consistent as the main subject, steam slowly rises, the camera pushes in slightly, warm morning light, commercial photography feel.",
    "reference_image_sources": [
      {
        "type": "file",
        "file_id": "file-20260729160108-****"
      }
    ],
    "duration": 5,
    "ratio": "16:9",
    "wait_for_completion": false
  }
}
```


The business\-side executor can parse the File ID into an asset that the video generation service can access, and then submit an asynchronous task. The first response usually only indicates that the task has been accepted:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.custom_tool_result",
        "custom_tool_use_id": "evt-20260729160130-****",
        "is_error": false,
        "content": [
          {
            "type": "text",
            "text": "{\"ok\":true,\"task_id\":\"cgt-20260729160142-****\",\"model\":\"dreamina-seedance-2-0-260128\",\"status\":\"queued\",\"video_url\":null}"
          }
        ]
      }
    ]
  }'
```


The user queries the task later:

```json
{
  "id": "evt-20260729160810-****",
  "type": "agent.custom_tool_use",
  "name": "get_video_task",
  "input": {
    "task_id": "cgt-20260729160142-****",
    "model": "dreamina-seedance-2-0-260128"
  }
}
```


Example response when the task is complete:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.custom_tool_result",
        "custom_tool_use_id": "evt-20260729160810-****",
        "is_error": false,
        "content": [
          {
            "type": "text",
            "text": "{\"ok\":true,\"task_id\":\"cgt-20260729160142-****\",\"model\":\"dreamina-seedance-2-0-260128\",\"status\":\"succeeded\",\"video_url\":\"https://example-cdn.volces.com/video/cgt-20260729160142-****.mp4\",\"usage\":{\"duration\":5}}"
          }
        ]
      }
    ]
  }'
```


For video results, return `video_url` as JSON text. For now, do not put the MP4 binary into the tool result as `document/base64`; this significantly increases the event size and may also prevent the model consumption layer from parsing it as a video modality.

<span id="example-4-query-and-understand-videos"></span>
## Example 4: query and understand videos

This example shows how to connect asynchronous task query with subsequent video understanding. Querying the task and understanding the video content are two actions:


1. `get_video_task` confirms the task status and obtains `video_url`.

2. Built\-in multimodal or video understanding tools read `video_url` and summarize the visual content.


When creating an agent, declare the task query tool:

```json
{
  "type": "custom",
  "name": "get_video_task",
  "description": "Query the asynchronous video task. Use this when the user asks to view video generation progress, confirm whether the task is complete, or obtain the video result. If the task is not complete, you can only state that it is still being generated; only when the task succeeds and contains video_url can you state that the video is complete.",
  "input_schema": {
    "type": "object",
    "properties": {
      "task_id": {
        "type": "string",
        "description": "Video task ID."
      },
      "model": {
        "type": "string",
        "description": "The model ID used when creating the task. This can be omitted."
      }
    },
    "required": ["task_id"],
    "additionalProperties": false
  }
}
```


After creating an agent and session that include this tool, the user requests to query and understand the video:

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260729153122-****/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.message",
        "content": [
          {
            "type": "text",
            "text": "Query task cgt-20260729160142-****. If the video is complete, understand the video content and summarize the shots, main subject actions, and visual style."
          }
        ]
      }
    ]
  }'
```


The model first calls `get_video_task`:

```json
{
  "id": "evt-20260729162000-****",
  "type": "agent.custom_tool_use",
  "name": "get_video_task",
  "input": {
    "task_id": "cgt-20260729160142-****",
    "model": "dreamina-seedance-2-0-260128"
  }
}
```


The business\-side executor returns the video URL:

```json
{
  "events": [
    {
      "type": "user.custom_tool_result",
      "custom_tool_use_id": "evt-20260729162000-****",
      "is_error": false,
      "content": [
        {
          "type": "text",
          "text": "{\"ok\":true,\"task_id\":\"cgt-20260729160142-****\",\"model\":\"dreamina-seedance-2-0-260128\",\"status\":\"succeeded\",\"video_url\":\"https://example-cdn.volces.com/video/cgt-20260729160142-****.mp4\"}"
        }
      ]
    }
  ]
}
```


Next, the agent should use the built\-in video understanding capability available in the environment to read this `video_url`. If your environment exposes this capability as a built\-in tool, you can explicitly require the following in the agent's system prompt:

```text
When get_video_task returns status=succeeded and contains video_url, and the user asks to understand the video content, continue to call the built-in multimodal or video understanding tool available in the environment to read video_url; do not guess the video content based only on the prompt or task_id.
```


Example final response:

```json
{
  "type": "agent.message",
  "content": [
    {
      "type": "text",
      "text": "The task is complete. The main subject of the video is a transparent glass coffee cup, with steam slowly rising from the rim; the camera slightly pushes in from a medium shot to a close-up, the green plants in the background remain blurred with shallow depth of field, and the overall style is clean commercial photography under warm morning light."
    }
  ]
}
```


If the current environment does not have a built\-in video understanding tool, the agent should state that it can only confirm that `video_url` has been generated and cannot claim that it has understood the video visuals.

<span id="reference-logic-for-the-business-side-executor"></span>
## Reference logic for the business\-side executor

The business\-side executor needs to maintain a pending tool call table. When receiving `agent.custom_tool_use`, first record the event; when receiving `requires_action`, find the corresponding tool calls based on `event_ids`, execute them, and return the results in batches.

```python
pending = {}

def process_event(event):
    event_type = event.get("type")

    if event_type == "agent.custom_tool_use":
        pending[event["id"]] = event
        return

    if event_type != "session.status_idle":
        return

    stop_reason = event.get("stop_reason") or {}
    if stop_reason.get("type") != "requires_action":
        return

    results = []
    for event_id in stop_reason.get("event_ids", []):
        tool_event = pending.pop(event_id)
        result = execute_custom_tool(tool_event)
        results.append({
            "type": "user.custom_tool_result",
            "custom_tool_use_id": event_id,
            "is_error": not result["ok"],
            "content": to_tool_result_content(result),
        })

    post_session_events({"events": results})
```


<span id="faqs"></span>
## FAQs

<span id="can-input-schema-be-passed-as-a-string"></span>
### Can `input_schema` be passed as a string?

This is not recommended.`input_schema` should be passed as a JSON object to prevent the platform or model side from failing to correctly understand the parameter structure.

<span id="what-are-the-naming-conventions-of-custom-tools"></span>
### What are the naming conventions of custom tools?

It is recommended to use 1 to 64 English letters, digits, underscores, or hyphens, such as `generate_image` and `get_video_task`. One agent can be configured with up to 8 custom tools.

<span id="why-do-video-results-only-return-video-url"></span>
### Why do video results only return `video_url`?

Video generation is usually an asynchronous task, and MP4 files are large, so returning them directly as tool results is not suitable. It is recommended to return JSON text, so that the agent, frontend, or subsequent built\-in video understanding tools can continue processing through `video_url`.

<span id="how-should-results-be-returned-when-multiple-custom-tools-are-triggered-at-the-same-time"></span>
### How should results be returned when multiple custom tools are triggered at the same time?

Use `stop_reason.event_ids` as the source of truth. After all tool calls in this array are completed, send them in a batch in the same `events` array:

```json
{
  "events": [
    {
      "type": "user.custom_tool_result",
      "custom_tool_use_id": "evt-20260729163001-****",
      "is_error": false,
      "content": [
        {
          "type": "text",
          "text": "{\"ok\":true,\"value\":\"alpha\"}"
        }
      ]
    },
    {
      "type": "user.custom_tool_result",
      "custom_tool_use_id": "evt-20260729163002-****",
      "is_error": false,
      "content": [
        {
          "type": "text",
          "text": "{\"ok\":true,\"value\":\"beta\"}"
        }
      ]
    }
  ]
}
```


<span id="debugging-tips"></span>
### Debugging tips


* After the business\-side executor starts, subscribe to or poll session events before sending the user message to avoid missing `requires_action`.

* When tool execution fails, also return `user.custom_tool_result` and set `is_error: true`.

* Do not print real API keys, complete signed URLs, complete Base64 strings, or unredacted resource IDs in logs or documents.

* For image generation and video generation backends, use an independent least\-privilege API key to make auditing and rotation easier.




