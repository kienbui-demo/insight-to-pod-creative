This topic describes how to upload files in ModelArk Managed Agents, mount files to a cloud sandbox, and add or remove file resources while a session is running.

Managed Agents can mount files uploaded through the [Files API](https://docs.byteplus.com/en/docs/ModelArk/1885708) or BytePlus Torch Object Storage (TOS), and then attach those files as session resources to directories in the sandbox environment. The Agent can read these files and perform tasks based on their content.

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>


<div data-tips="true" data-tips-type="warning">Before mounting TOS files, make sure that TOS and Managed Agents belong to the same BytePlus account.</div>


<span id="upload-files"></span>
## Upload files

You can upload files that need to be read by the agent through the Files API or TOS.


* Use the Files API:


First upload the local file to the Files API. After the upload succeeds, the platform returns a `file_id`. You need this ID when creating a session or appending file resources to a running session.

> Set `purpose=agent` to indicate that the file is used by an Agent.


```bash
file=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/files" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -F 'purpose=agent' \
    -F 'file=@path/of/your/file'
)

FILE_ID=$(jq -er '.id' <<<"$file")

echo "File ID: $FILE_ID"
```



* Use TOS:


The following example uses the TOS Python SDK to upload a local file. For detailed instructions on TOS, see the [TOS documentation](https://docs.byteplus.com/en/docs/tos/docs-quick-start_1).

```python
import os
import tos

ak = os.getenv("TOS_ACCESS_KEY")
sk = os.getenv("TOS_SECRET_KEY")

endpoint = "tos-ap-southeast-1.bytepluses.com"
region = "ap-southeast-1"

bucket_name = "<BUCKET_NAME>"
object_key = "<OBJECT_KEY>"   # The path of the uploaded file. For example: agent-files/skill.md
file_name = "/path/of/your/file"  # Local file path

try:
    client = tos.TosClientV2(ak, sk, endpoint, region)

    result = client.put_object_from_file(
        bucket_name,
        object_key,
        file_name,
    )

    print("upload success")
    print("request_id:", result.request_id)
    print("etag:", result.etag)

except tos.exceptions.TosClientError as e:
    print("client error:", e.message)
    print("cause:", e.cause)

except tos.exceptions.TosServerError as e:
    print("server error code:", e.code)
    print("request_id:", e.request_id)
    print("message:", e.message)
    print("status_code:", e.status_code)
    print("request_url:", e.request_url)

except Exception as e:
    print("unknown error:", str(e))
```


<span id="mount-files-when-creating-a-session"></span>
## Mount files when creating a session

When creating a session, declare the files to mount in the `resources` array.

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>


<div data-tips="true" data-tips-type="tip">You can also create a session in the <a href="https://console.byteplus.com/ark/region:ark+ap-southeast-1/managed-agents/sessions">ModelArk console</a>.</div>



* Mount by Files ID:


Each file resource must contain at least `type` and `file_id`.

`mount_path` is optional. It is recommended to set `mount_path` so that the agent can access the file from a stable and readable path. If you do not explicitly specify a path, make sure that the uploaded file name is clear enough for the Agent to identify its purpose.

```bash
session=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "agent": "$AGENT_ID",
  "environment_id": "$ENVIRONMENT_ID",
  "resources": [
    {
      "type": "file",
      "file_id": "$FILE_ID",
      "mount_path": "target/mounting/path/of/the/file"
    }
  ]
}
EOF
)

SESSION_ID=$(jq -er '.id' <<<"$session")

echo "Session ID: $SESSION_ID"
```


<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>


<div data-tips="true" data-tips-type="tip"><code>mount_path</code> is the target mount path in the cloud sandbox. Files passed through <code>file_id</code> are mounted under <code>/mnt/session/uploads/</code> according to the path you specify.</div>


<div data-tips="true" data-tips-type="tip">For example, if you specify <code>my-skills/skill-1.md</code>, the mounted file path is <code>/mnt/session/uploads/my-skills/skill-1.md</code>.</div>


After mounting, the platform generates a new `file_id` for the file instance in the session. These in\-session copies do not count toward the user's file storage quota.


* Mount from TOS:


```bash
session=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "agent": "$AGENT_ID",
  "environment_id": "$ENVIRONMENT_ID",
  "resources": [
    {
      "type": "tos",
      "tos_bucket": "<BUCKET_NAME>",
      "tos_key": "path/of/the/tos/directory/"
    }
  ]
}
EOF
)

SESSION_ID=$(jq -er '.id' <<<"$session")

echo "Session ID: $SESSION_ID"
```


<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>



* <div data-tips="true" data-tips-type="tip"><code>tos_key</code> must be a directory in the TOS bucket and must end with <code>/</code>. For example: <code>project-resources/</code>.</div>


* <div data-tips="true" data-tips-type="tip">Files are mounted to <code>/mnt/session/storage/</code> in the cloud sandbox.</div>



<span id="mount-multiple-files"></span>
## Mount multiple files

If a task requires multiple input files, you can add multiple entries to `resources`. A single session supports mounting up to 100 files.

The following is an example using Files IDs:

```json
"resources": [
  { "type": "file", "file_id": "<FILE_ID_1>" },
  { "type": "file", "file_id": "<FILE_ID_2>" },
  { "type": "file", "file_id": "<FILE_ID_3>" }
]
```


<span id="manage-files-while-a-session-is-running"></span>
## Manage files while a session is running

After a session is created, you can also dynamically add or remove files through the Session Resources API. When you add a resource or list resources, the API returns a resource ID. You need this resource ID when deleting a resource.

<span id="add-a-file-resource"></span>
### Add a file resource

```bash
resource=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/$SESSION_ID/resources" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "type": "file",
  "file_id": "$FILE_ID"
}
EOF
)

RESOURCE_ID=$(jq -er '.id' <<<"$resource")

echo "Resource ID: $RESOURCE_ID"
```


<span id="list-and-delete-file-resources"></span>
### List and delete file resources

```bash
# List session resources
curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/$SESSION_ID/resources" \
  -H "Authorization: Bearer $ARK_API_KEY"

# Delete a specified resource
curl -sS --fail-with-body -X DELETE \
  "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/$SESSION_ID/resources/$RESOURCE_ID" \
  -H "Authorization: Bearer $ARK_API_KEY"
```


<span id="list-files-generated-in-a-session"></span>
## List files generated in a session

Files generated by the Agent in a session can be queried through the Files API. You can specify the session ID with `scope_id` to list files associated with that session.

```bash
# List files associated with a session
curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/files?scope_id=$SESSION_ID" \
  -H "Authorization: Bearer $ARK_API_KEY"
```


<span id="supported-file-types"></span>
## Supported file types

The Agent can process different types of file. Common types include:


* Source code files, such as `.py`, `.js`, `.ts`, `.go`, and `.rs`.

* Data files, such as `.csv`, `.json`, `.xml`, and `.yaml`.

* Text documents, such as `.txt` and `.md`.

* Archive files, such as `.zip` and `.tar.gz`. The agent can use bash in the sandbox to decompress and process them.

* Binary files. Whether they can be processed correctly depends on whether the required tools are available in the sandbox.


<span id="recommendations"></span>
## Recommendations


* Files mounted into the sandbox are read\-only copies. The agent can read these files, but cannot directly modify the original uploaded files.

* If a task needs to produce a modified version, ask the agent to write the result to a new path in the sandbox.

* Output files that need to be stored for the long term or returned to you should be written to an agreed directory in the task instructions.

* If a running session no longer needs a large file, remove the corresponding resource in time to reduce context noise in subsequent tool calls.




