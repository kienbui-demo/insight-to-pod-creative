This topic describes the preinstalled programming languages, databases, utilities, and base resource specifications in the Managed Agents cloud sandbox, so that you can quickly check them when configuring the environment or evaluating task dependencies.

The cloud sandbox runs in an isolated Linux container provided by ModelArk. Common runtimes, database clients, and command\-line tools are preinstalled and can be used directly by the Agent.

> The specifications described in this topic apply to environments of type `cloud`.


<span id="programming-languages"></span>
## Programming languages

Common programming languages and their package managers are preinstalled and can be used directly for script execution, project builds, and dependency installation.


|Programming language |Version |Package manager |
|---|---|---|
|Python |3.12+ |pip, uv |
|Node.js |20+ |npm, yarn, pnpm |
|Go |1.25+ |go modules |
|Rust |1.77+ |cargo |
|Java |21+ |maven, gradle |
|Ruby |3.3+ |bundler, gem |
|PHP |8.3+ |composer |
|C/C++ |GCC 13+ |make, cmake |


<span id="databases"></span>
## Databases

Lightweight databases and database clients are available by default and are suitable for local data processing or connecting to external databases and instances.


|Database |Description |
|---|---|
|SQLite |Preinstalled and ready to use |
|PostgreSQL client |`psql` client for connecting to external PostgreSQL databases |
|Redis client |`redis-cli` for connecting to external Redis instances |



* SQLite can be used locally in the sandbox.

* Database servers such as PostgreSQL and Redis are not running in the sandbox by default. The sandbox provides client tools for connecting to them.


<span id="utilities"></span>
## Utilities

Built\-in utilities cover system operations, development and build workflows, file search, process inspection, and text processing.

<span id="system-tools"></span>
### System tools


|Tool |Description |
|---|---|
|`git` |Version control |
|`curl`, `wget` |HTTP clients |
|`jq` |JSON processing |
|`tar`, `zip`, `unzip` |Archiving, compression, and extraction |
|`ssh`, `scp` |Remote access and file transfer tools (networking must be enabled) |
|`tmux`, `screen` |Terminal multiplexers |


<span id="development-tools"></span>
### Development tools


|Tool |Description |
|---|---|
|`make`, `cmake` |Build systems |
|`ripgrep` (`rg`) |Fast file search |
|`tree` |Directory tree visualization |
|`htop` |Process monitoring |


<span id="text-processing"></span>
### Text processing


|Tool |Description |
|---|---|
|`sed`, `awk`, `grep` |Streaming text processing tools |
|`vim`, `nano` |Text editors |
|`diff`, `patch` |File comparison and patch tools |


<span id="sandbox-specifications"></span>
## Sandbox specifications

The following base resource specifications can be used to evaluate runtime resources and network capabilities for the cloud sandbox.


|Item |Configuration |
|---|---|
|Operating system |Ubuntu 22.04 LTS |
|Architecture |x86_64 (amd64) |
|Memory |4 GB |
|Disk space |10 GB |
|Network |Enabled by default |


<span id="key-directories-and-agent-permissions"></span>
## Key directories and agent permissions

The following table lists key directories in the cloud sandbox environment and the permissions available to the agent.


|Directory |Description |Agent read |Agent write |
|---|---|---|---|
|`$HOME` |User's home directory |✓ |✓ |
|`/workspace` |Workspace<br><br>**Note** : `/workspace/AGENTS.md` (System Prompt) is read\-only. |✓ |✓ |
|`/mnt` |Mount directory |✓ |✓ |
|`/mnt/session/outputs` |Output directory |✓ |✓ |
|`/mnt/session/storage` |TOS file mount directory |✓ |✓ |
|`/mnt/session/uploads` |Files API file mount directory |✓ |✗ |
|`/mnt/skills` |Skills directory |✓ |✗ |
|`/mnt/memory` |Memory directory |✓ |✗ |
|`/tmp` |Temporary directory |✓ |✓ |
|Any other path |\- |✗ |✗ |




