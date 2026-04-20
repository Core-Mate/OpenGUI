# LangGraph CLI

**LangGraph CLI** is a command-line tool for building and running the [Agent Server](/langsmith/agent-server) locally. The resulting server exposes all API endpoints for runs, threads, assistants, etc., and includes supporting services such as a managed database for checkpointing and storage.

## Installation

1. Ensure Docker is installed (e.g., `docker --version`).

2. Install the CLI:

   <CodeGroup>
     ```bash [Python (pip)] theme={null}
     pip install langgraph-cli
     ```

     ```bash JavaScript theme={null}
     # Use latest on demand
     npx @langchain/langgraph-cli

     # Or install globally (available as `langgraphjs`)
     npm install -g @langchain/langgraph-cli
     ```
   </CodeGroup>

3. Verify the install

   <CodeGroup>
     ```bash [Python (pip)] theme={null}
     langgraph --help
     ```

     ```bash JavaScript theme={null}
     npx @langchain/langgraph-cli --help
     ```
   </CodeGroup>

### Quick commands

| Command                               | What it does                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`langgraph dev`](#dev)               | Starts a lightweight local dev server (no Docker required), ideal for rapid testing.                                                 |
| [`langgraph build`](#build)           | Builds a Docker image of your LangGraph API server for deployment.                                                                   |
| [`langgraph dockerfile`](#dockerfile) | Emits a Dockerfile derived from your config for custom builds.                                                                       |
| [`langgraph up`](#up)                 | Starts the LangGraph API server locally in Docker. Requires Docker running; LangSmith API key for local dev; license for production. |

For JS, use `npx @langchain/langgraph-cli <command>` (or `langgraphjs` if installed globally).

## Configuration file

To build and run a valid application, the LangGraph CLI requires a JSON configuration file that follows this [schema](https://raw.githubusercontent.com/langchain-ai/langgraph/refs/heads/main/libs/cli/schemas/schema.json). It contains the following properties:

<Note>The LangGraph CLI defaults to using the configuration file named <strong>langgraph.json</strong> in the current directory.</Note>

<Tabs>
  <Tab title="Python">
    | Key                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
    | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | <span style={{ whiteSpace: "nowrap" }}>`dependencies`</span>     | **Required**. Array of dependencies for LangSmith API server. Dependencies can be one of the following: <ul><li>A single period (`"."`), which will look for local Python packages.</li><li>The directory path where `pyproject.toml`, `setup.py` or `requirements.txt` is located.<br />For example, if `requirements.txt` is located in the root of the project directory, specify `"./"`. If it's located in a subdirectory called `local_package`, specify `"./local_package"`. Do not specify the string `"requirements.txt"` itself.</li><li>A Python package name.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
    | <span style={{ whiteSpace: "nowrap" }}>`graphs`</span>           | **Required**. Mapping from graph ID to path where the compiled graph or a function that makes a graph is defined. Example: <ul><li>`./your_package/your_file.py:variable`, where `variable` is an instance of `langgraph.graph.state.CompiledStateGraph`</li><li>`./your_package/your_file.py:make_graph`, where `make_graph` is a function that takes a config dictionary (`langchain_core.runnables.RunnableConfig`) and returns an instance of `langgraph.graph.state.StateGraph` or `langgraph.graph.state.CompiledStateGraph`. See [how to rebuild a graph at runtime](/langsmith/graph-rebuild) for more details.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
    | <span style={{ whiteSpace: "nowrap" }}>`auth`</span>             | *(Added in v0.0.11)* Auth configuration containing the path to your authentication handler. Example: `./your_package/auth.py:auth`, where `auth` is an instance of `langgraph_sdk.Auth`. See [authentication guide](/langsmith/auth) for details.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
    | <span style={{ whiteSpace: "nowrap" }}>`base_image`</span>       | Optional. Base image to use for the LangGraph API server. Defaults to `langchain/langgraph-api` or `langchain/langgraphjs-api`. Use this to pin your builds to a particular version of the langgraph API, such as `"langchain/langgraph-server:0.2"`. See [https://hub.docker.com/r/langchain/langgraph-server/tags](https://hub.docker.com/r/langchain/langgraph-server/tags) for more details. (added in `langgraph-cli==0.2.8`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
    | <span style={{ whiteSpace: "nowrap" }}>`image_distro`</span>     | Optional. Linux distribution for the base image. Must be one of `"debian"`, `"wolfi"`, `"bookworm"`, or `"bullseye"`. If omitted, defaults to `"debian"`. Available in `langgraph-cli>=0.2.11`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
    | <span style={{ whiteSpace: "nowrap" }}>`env`</span>              | Path to `.env` file or a mapping from environment variable to its value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
    | <span style={{ whiteSpace: "nowrap" }}>`store`</span>            | Configuration for adding semantic search and/or time-to-live (TTL) to the BaseStore. Contains the following fields: <ul><li>`index` (optional): Configuration for semantic search indexing with fields `embed`, `dims`, and optional `fields`.</li><li>`ttl` (optional): Configuration for item expiration. An object with optional fields: `refresh_on_read` (boolean, defaults to `true`), `default_ttl` (float, lifespan in **minutes**; applied to newly created items only; existing items are unchanged; defaults to no expiration), and `sweep_interval_minutes` (integer, how often to check for expired items, defaults to no sweeping).</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
    | <span style={{ whiteSpace: "nowrap" }}>`ui`</span>               | Optional. Named definitions of UI components emitted by the agent, each pointing to a JS/TS file. (added in `langgraph-cli==0.1.84`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
    | <span style={{ whiteSpace: "nowrap" }}>`python_version`</span>   | `3.11`, `3.12`, or `3.13`. Defaults to `3.11`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
    | <span style={{ whiteSpace: "nowrap" }}>`node_version`</span>     | Specify `node_version: 20` to use LangGraph.js.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
    | <span style={{ whiteSpace: "nowrap" }}>`pip_config_file`</span>  | Path to `pip` config file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
    | <span style={{ whiteSpace: "nowrap" }}>`pip_installer`</span>    | *(Added in v0.3)* Optional. Python package installer selector. It can be set to `"auto"`, `"pip"`, or `"uv"`. From version 0.3 onward the default strategy is to run `uv pip`, which typically delivers faster builds while remaining a drop-in replacement. In the uncommon situation where `uv` cannot handle your dependency graph or the structure of your `pyproject.toml`, specify `"pip"` here to revert to the earlier behaviour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
    | <span style={{ whiteSpace: "nowrap" }}>`keep_pkg_tools`</span>   | *(Added in v0.3.4)* Optional. Control whether to retain Python packaging tools (`pip`, `setuptools`, `wheel`) in the final image. Accepted values: <ul><li><code>true</code> : Keep all three tools (skip uninstall).</li><li><code>false</code> / omitted : Uninstall all three tools (default behaviour).</li><li><code>list\[str]</code> : Names of tools <strong>to retain</strong>. Each value must be one of "pip", "setuptools", "wheel".</li></ul>. By default, all three tools are uninstalled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
    | <span style={{ whiteSpace: "nowrap" }}>`dockerfile_lines`</span> | Array of additional lines to add to Dockerfile following the import from parent image.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
    | <span style={{ whiteSpace: "nowrap" }}>`checkpointer`</span>     | Configuration for the checkpointer. Supports: <ul><li>`ttl` (optional): Object with `strategy`, `sweep_interval_minutes`, `default_ttl` controlling checkpoint expiry.</li><li>`serde` (optional, 0.5+): Object with `allowed_json_modules` and `pickle_fallback` to tune deserialization behavior.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
    | <span style={{ whiteSpace: "nowrap" }}>`http`</span>             | HTTP server configuration with the following fields: <ul><li>`app`: Path to custom Starlette/FastAPI app (e.g., `"./src/agent/webapp.py:app"`). See [custom routes guide](/langsmith/custom-routes).</li><li>`cors`: CORS configuration with fields such as `allow_origins`, `allow_methods`, `allow_headers`, `allow_credentials`, `allow_origin_regex`, `expose_headers`, and `max_age`.</li><li>`configurable_headers`: Define which request headers to expose as configurable values via `includes` / `excludes` patterns.</li><li>`logging_headers`: Mirror of `configurable_headers` for excluding sensitive headers from logs.</li><li>`middleware_order`: Choose how custom middleware and auth interact. `auth_first` runs authentication hooks before custom middleware, while `middleware_first` (default) runs your middleware first.</li><li>`enable_custom_route_auth`: Apply auth checks to routes added through `app`.</li><li>`disable_assistants`, `disable_mcp`, `disable_a2a`, `disable_meta`, `disable_runs`, `disable_store`, `disable_threads`, `disable_ui`, `disable_webhooks`: Disable built-in routes or hooks.</li><li>`mount_prefix`: Prefix for mounted routes (e.g., "/my-deployment/api").</li></ul> |
    | <span style={{ whiteSpace: "nowrap" }}>`api_version`</span>      | *(Added in v0.3.7)* Which semantic version of the LangGraph API server to use (e.g., `"0.3"`). Defaults to latest. Check the server [changelog](/langsmith/agent-server-changelog) for details on each release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  </Tab>

  <Tab title="JS">
    | Key                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
    | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | <span style={{ whiteSpace: "nowrap" }}>`graphs`</span>           | **Required**. Mapping from graph ID to path where the compiled graph or a function that makes a graph is defined. Example: <ul><li>`./src/graph.ts:variable`, where `variable` is an instance of [`CompiledStateGraph`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph)</li><li>`./src/graph.ts:makeGraph`, where `makeGraph` is a function that takes a config dictionary (`LangGraphRunnableConfig`) and returns an instance of [`StateGraph`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.StateGraph) or [`CompiledStateGraph`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph). See [how to rebuild a graph at runtime](/langsmith/graph-rebuild) for more details.</li></ul> |
    | <span style={{ whiteSpace: "nowrap" }}>`env`</span>              | Path to `.env` file or a mapping from environment variable to its value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
    | <span style={{ whiteSpace: "nowrap" }}>`store`</span>            | Configuration for adding semantic search and/or time-to-live (TTL) to the BaseStore. Contains the following fields: <ul><li>`index` (optional): Configuration for semantic search indexing with fields `embed`, `dims`, and optional `fields`.</li><li>`ttl` (optional): Configuration for item expiration. An object with optional fields: `refresh_on_read` (boolean, defaults to `true`), `default_ttl` (float, lifespan in **minutes**; applied to newly created items only; existing items are unchanged; defaults to no expiration), and `sweep_interval_minutes` (integer, how often to check for expired items, defaults to no sweeping).</li></ul>                                                                                                                                                                |
    | <span style={{ whiteSpace: "nowrap" }}>`node_version`</span>     | Specify `node_version: 20` to use LangGraph.js.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
    | <span style={{ whiteSpace: "nowrap" }}>`dockerfile_lines`</span> | Array of additional lines to add to Dockerfile following the import from parent image.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
    | <span style={{ whiteSpace: "nowrap" }}>`checkpointer`</span>     | Configuration for the checkpointer. Supports: <ul><li>`ttl` (optional): Object with `strategy`, `sweep_interval_minutes`, `default_ttl` controlling checkpoint expiry.</li><li>`serde` (optional, 0.5+): Object with `allowed_json_modules` and `pickle_fallback` to tune deserialization behavior.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
    | <span style={{ whiteSpace: "nowrap" }}>`http`</span>             | HTTP server configuration mirroring the Python options: <ul><li>`cors` with `allow_origins`, `allow_methods`, `allow_headers`, `allow_credentials`, `allow_origin_regex`, `expose_headers`, `max_age`.</li><li>`configurable_headers` and `logging_headers` pattern lists.</li><li>`middleware_order` (`auth_first` or `middleware_first`).</li><li>`enable_custom_route_auth` plus the same boolean route toggles as above.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                     |
    | <span style={{ whiteSpace: "nowrap" }}>`api_version`</span>      | *(Added in v0.3.7)* Which semantic version of the LangGraph API server to use (e.g., `"0.3"`). Defaults to latest. Check the server [changelog](/langsmith/agent-server-changelog) for details on each release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
  </Tab>
</Tabs>

### Examples

<Tabs>
  <Tab title="Python">
    #### Basic configuration

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "chat": "chat.graph:graph"
      }
    }
    ```

    #### Using Wolfi base images

    You can specify the Linux distribution for your base image using the `image_distro` field. Valid options are `debian`, `wolfi`, `bookworm`, or `bullseye`. Wolfi is the recommended option as it provides smaller and more secure images. This is available in `langgraph-cli>=0.2.11`.

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "chat": "chat.graph:graph"
      },
      "image_distro": "wolfi"
    }
    ```

    #### Adding semantic search to the store

    All deployments come with a DB-backed BaseStore. Adding an "index" configuration to your `langgraph.json` will enable [semantic search](/langsmith/semantic-search) within the BaseStore of your deployment.

    The `index.fields` configuration determines which parts of your documents to embed:

    * If omitted or set to `["$"]`, the entire document will be embedded
    * To embed specific fields, use JSON path notation: `["metadata.title", "content.text"]`
    * Documents missing specified fields will still be stored but won't have embeddings for those fields
    * You can still override which fields to embed on a specific item at `put` time using the `index` parameter

    ```json  theme={null}
    {
      "dependencies": ["."],
      "graphs": {
        "memory_agent": "./agent/graph.py:graph"
      },
      "store": {
        "index": {
          "embed": "openai:text-embedding-3-small",
          "dims": 1536,
          "fields": ["$"]
        }
      }
    }
    ```

    <Note>
      **Common model dimensions**

      * `openai:text-embedding-3-large`: 3072
      * `openai:text-embedding-3-small`: 1536
      * `openai:text-embedding-ada-002`: 1536
      * `cohere:embed-english-v3.0`: 1024
      * `cohere:embed-english-light-v3.0`: 384
      * `cohere:embed-multilingual-v3.0`: 1024
      * `cohere:embed-multilingual-light-v3.0`: 384
    </Note>

    #### Semantic search with a custom embedding function

    If you want to use semantic search with a custom embedding function, you can pass a path to a custom embedding function:

    ```json  theme={null}
    {
      "dependencies": ["."],
      "graphs": {
        "memory_agent": "./agent/graph.py:graph"
      },
      "store": {
        "index": {
          "embed": "./embeddings.py:embed_texts",
          "dims": 768,
          "fields": ["text", "summary"]
        }
      }
    }
    ```

    The `embed` field in store configuration can reference a custom function that takes a list of strings and returns a list of embeddings. Example implementation:

    ```python  theme={null}
    # embeddings.py
    def embed_texts(texts: list[str]) -> list[list[float]]:
        """Custom embedding function for semantic search."""
        # Implementation using your preferred embedding model
        return [[0.1, 0.2, ...] for _ in texts]  # dims-dimensional vectors
    ```

    #### Adding custom authentication

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "chat": "chat.graph:graph"
      },
      "auth": {
        "path": "./auth.py:auth",
        "openapi": {
          "securitySchemes": {
            "apiKeyAuth": {
              "type": "apiKey",
              "in": "header",
              "name": "X-API-Key"
            }
          },
          "security": [{ "apiKeyAuth": [] }]
        },
        "disable_studio_auth": false
      }
    }
    ```

    See the [authentication conceptual guide](/langsmith/auth) for details, and the [setting up custom authentication](/langsmith/set-up-custom-auth) guide for a practical walk through of the process.

    <a id="ttl" />

    #### Configuring store item Time-to-Live

    You can configure default data expiration for items/memories in the BaseStore using the `store.ttl` key. This determines how long items are retained after they are last accessed (with reads potentially refreshing the timer based on `refresh_on_read`). Note that these defaults can be overwritten on a per-call basis by modifying the corresponding arguments in `get`, `search`, etc.

    The `ttl` configuration is an object containing optional fields:

    * `refresh_on_read`: If `true` (the default), accessing an item via `get` or `search` resets its expiration timer. Set to `false` to only refresh TTL on writes (`put`).
    * `default_ttl`: The default lifespan of an item in **minutes**. Applies only to newly created items; existing items are not modified. If not set, items do not expire by default.
    * `sweep_interval_minutes`: How frequently (in minutes) the system should run a background process to delete expired items. If not set, sweeping does not occur automatically.

    Here is an example enabling a 7-day TTL (10080 minutes), refreshing on reads, and sweeping every hour:

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "memory_agent": "./agent/graph.py:graph"
      },
      "store": {
        "ttl": {
          "refresh_on_read": true,
          "sweep_interval_minutes": 60,
          "default_ttl": 10080
        }
      }
    }
    ```

    <a id="ttl" />

    #### Configuring checkpoint Time-to-Live

    You can configure the time-to-live (TTL) for checkpoints using the `checkpointer` key. This determines how long checkpoint data is retained before being automatically handled according to the specified strategy (e.g., deletion). Two optional sub-objects are supported:

    * `ttl`: Includes `strategy`, `sweep_interval_minutes`, and `default_ttl`, which collectively set how checkpoints expire.
    * `serde` *(Agent server 0.5+)* : Lets you control deserialization behavior for checkpoint payloads.

    Here's an example setting a default TTL of 30 days (43200 minutes):

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "chat": "chat.graph:graph"
      },
      "checkpointer": {
        "ttl": {
          "strategy": "delete",
          "sweep_interval_minutes": 10,
          "default_ttl": 43200
        }
      }
    }
    ```

    In this example, checkpoints older than 30 days will be deleted, and the check runs every 10 minutes.

    #### Configuring checkpointer serde

    The `checkpointer.serde` object shapes deserialization:

    * `allowed_json_modules` defines an allow list for custom Python objects you want the server to be able to deserialize from payloads saved in "json" mode. This is a list of `[path, to, module, file, symbol]` sequences. If omitted, only LangChain-safe defaults are allowed. You can unsafely set to `true` to allow any module to be deserialized.
    * `pickle_fallback`: Whether to fall back to pickle deserialization when JSON decoding fails.

    ```json  theme={null}
    {
      "checkpointer": {
        "serde": {
          "allowed_json_modules": [
            ["my_agent", "auth", "SessionState"]
          ]
        }
      }
    }
    ```

    #### Customizing HTTP middleware and headers

    The `http` block lets you fine-tune request handling:

    * `middleware_order`: Choose `"auth_first"` to run authentication before your middleware, or `"middleware_first"` (default) to invert that order.
    * `enable_custom_route_auth`: Extend authentication to routes you mount through `http.app`.
    * `configurable_headers` / `logging_headers`: Each accepts an object with optional `includes` and `excludes` arrays; wildcards are supported and exclusions run before inclusions.
    * `cors`: In addition to `allow_origins`, `allow_methods`, and `allow_headers`, you can set `allow_credentials`, `allow_origin_regex`, `expose_headers`, and `max_age` for detailed browser control.

      <a id="api-version" />

    #### Pinning API version

    *(Added in v0.3.7)*

    You can pin the API version of the Agent Server by using the `api_version` key. This is useful if you want to ensure that your server uses a specific version of the API.
    By default, builds in Cloud deployments use the latest stable version of the server. This can be pinned by setting the `api_version` key to a specific version.

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "chat": "chat.graph:graph"
      },
      "api_version": "0.2"
    }
    ```
  </Tab>

  <Tab title="JS">
    #### Basic configuration

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "graphs": {
        "chat": "./src/graph.ts:graph"
      }
    }
    ```

    <a id="api-version" />

    #### Pinning API version

    *(Added in v0.3.7)*

    You can pin the API version of the Agent Server by using the `api_version` key. This is useful if you want to ensure that your server uses a specific version of the API.
    By default, builds in Cloud deployments use the latest stable version of the server. This can be pinned by setting the `api_version` key to a specific version.

    ```json  theme={null}
    {
      "$schema": "https://langgra.ph/schema.json",
      "dependencies": ["."],
      "graphs": {
        "chat": "./src/chat/graph.ts:graph"
      },
      "api_version": "0.2"
    }
    ```
  </Tab>
</Tabs>

## Commands

**Usage**

<Tabs>
  <Tab title="Python">
    The base command for the LangGraph CLI is `langgraph`.

    ```
    langgraph [OPTIONS] COMMAND [ARGS]
    ```
  </Tab>

  <Tab title="JS">
    The base command for the LangGraph.js CLI is `langgraphjs`.

    ```
    npx @langchain/langgraph-cli [OPTIONS] COMMAND [ARGS]
    ```

    We recommend using `npx` to always use the latest version of the CLI.
  </Tab>
</Tabs>

### `dev`

<Tabs>
  <Tab title="Python">
    Run LangGraph API server in development mode with hot reloading and debugging capabilities. This lightweight server requires no Docker installation and is suitable for development and testing. State is persisted to a local directory.

    <Note>Currently, the CLI only supports Python >= 3.11.</Note>

    **Installation**

    This command requires the "inmem" extra to be installed:

    ```bash  theme={null}
    pip install -U "langgraph-cli[inmem]"
    ```

    **Usage**

    ```
    langgraph dev [OPTIONS]
    ```

    **Options**

    | Option                        | Default          | Description                                                                                                                                                                  |
    | ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `-c, --config FILE`           | `langgraph.json` | Path to configuration file declaring dependencies, graphs and environment variables                                                                                          |
    | `--host TEXT`                 | `127.0.0.1`      | Host to bind the server to                                                                                                                                                   |
    | `--port INTEGER`              | `2024`           | Port to bind the server to                                                                                                                                                   |
    | `--no-reload`                 |                  | Disable auto-reload                                                                                                                                                          |
    | `--n-jobs-per-worker INTEGER` |                  | Number of jobs per worker. Default is 10                                                                                                                                     |
    | `--debug-port INTEGER`        |                  | Port for debugger to listen on                                                                                                                                               |
    | `--wait-for-client`           | `False`          | Wait for a debugger client to connect to the debug port before starting the server                                                                                           |
    | `--no-browser`                |                  | Skip automatically opening the browser when the server starts                                                                                                                |
    | `--studio-url TEXT`           |                  | URL of the Studio instance to connect to. Defaults to [https://smith.langchain.com](https://smith.langchain.com)                                                             |
    | `--allow-blocking`            | `False`          | Do not raise errors for synchronous I/O blocking operations in your code (added in `0.2.6`)                                                                                  |
    | `--tunnel`                    | `False`          | Expose the local server via a public tunnel (Cloudflare) for remote frontend access. This avoids issues with browsers like Safari or networks blocking localhost connections |
    | `--help`                      |                  | Display command documentation                                                                                                                                                |
  </Tab>

  <Tab title="JS">
    Run LangGraph API server in development mode with hot reloading capabilities. This lightweight server requires no Docker installation and is suitable for development and testing. State is persisted to a local directory.

    **Usage**

    ```
    npx @langchain/langgraph-cli dev [OPTIONS]
    ```

    **Options**

    | Option                        | Default          | Description                                                                                                                                                      |
    | ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `-c, --config FILE`           | `langgraph.json` | Path to configuration file declaring dependencies, graphs and environment variables                                                                              |
    | `--host TEXT`                 | `127.0.0.1`      | Host to bind the server to                                                                                                                                       |
    | `--port INTEGER`              | `2024`           | Port to bind the server to                                                                                                                                       |
    | `--no-reload`                 |                  | Disable auto-reload                                                                                                                                              |
    | `--n-jobs-per-worker INTEGER` |                  | Number of jobs per worker. Default is 10                                                                                                                         |
    | `--debug-port INTEGER`        |                  | Port for debugger to listen on                                                                                                                                   |
    | `--wait-for-client`           | `False`          | Wait for a debugger client to connect to the debug port before starting the server                                                                               |
    | `--no-browser`                |                  | Skip automatically opening the browser when the server starts                                                                                                    |
    | `--studio-url TEXT`           |                  | URL of the Studio instance to connect to. Defaults to [https://smith.langchain.com](https://smith.langchain.com)                                                 |
    | `--allow-blocking`            | `False`          | Do not raise errors for synchronous I/O blocking operations in your code                                                                                         |
    | `--tunnel`                    | `False`          | Expose the local server via a public tunnel (Cloudflare) for remote frontend access. This avoids issues with browsers or networks blocking localhost connections |
    | `--help`                      |                  | Display command documentation                                                                                                                                    |
  </Tab>
</Tabs>

### `build`

<Tabs>
  <Tab title="Python">
    Build LangSmith API server Docker image.

    **Usage**

    ```
    langgraph build [OPTIONS]
    ```

    **Options**

    | Option                                | Default          | Description                                                                                                                                             |
    | ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `--platform TEXT`                     |                  | Target platform(s) to build the Docker image for. Example: `langgraph build --platform linux/amd64,linux/arm64`                                         |
    | `-t, --tag TEXT`                      |                  | **Required**. Tag for the Docker image. Example: `langgraph build -t my-image`                                                                          |
    | `--pull / --no-pull`                  | `--pull`         | Build with latest remote Docker image. Use `--no-pull` for running the LangSmith API server with locally built images.                                  |
    | `-c, --config FILE`                   | `langgraph.json` | Path to configuration file declaring dependencies, graphs and environment variables.                                                                    |
    | `--build-command TEXT`<sup>\*</sup>   |                  | Build command to run. Runs from the directory where your `langgraph.json` file lives. Example: `langgraph build --build-command "yarn run turbo build"` |
    | `--install-command TEXT`<sup>\*</sup> |                  | Install command to run. Runs from the directory where you call `langgraph build` from. Example: `langgraph build --install-command "yarn install"`      |
    | `--help`                              |                  | Display command documentation.                                                                                                                          |

    <sup>\*</sup>Only supported for JS deployments, will have no impact on Python deployments.
  </Tab>

  <Tab title="JS">
    Build LangSmith API server Docker image.

    **Usage**

    ```
    npx @langchain/langgraph-cli build [OPTIONS]
    ```

    **Options**

    | Option              | Default          | Description                                                                                                     |
    | ------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
    | `--platform TEXT`   |                  | Target platform(s) to build the Docker image for. Example: `langgraph build --platform linux/amd64,linux/arm64` |
    | `-t, --tag TEXT`    |                  | **Required**. Tag for the Docker image. Example: `langgraph build -t my-image`                                  |
    | `--no-pull`         |                  | Use locally built images. Defaults to `false` to build with latest remote Docker image.                         |
    | `-c, --config FILE` | `langgraph.json` | Path to configuration file declaring dependencies, graphs and environment variables.                            |
    | `--help`            |                  | Display command documentation.                                                                                  |
  </Tab>
</Tabs>

### `up`

<Tabs>
  <Tab title="Python">
    Start LangGraph API server. For local testing, requires a LangSmith API key with access to LangSmith. Requires a license key for production use.

    **Usage**

    ```
    langgraph up [OPTIONS]
    ```

    **Options**

    | Option                       | Default                   | Description                                                                                                             |
    | ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
    | `--wait`                     |                           | Wait for services to start before returning. Implies --detach                                                           |
    | `--base-image TEXT`          | `langchain/langgraph-api` | Base image to use for the LangGraph API server. Pin to specific versions using version tags.                            |
    | `--image TEXT`               |                           | Docker image to use for the langgraph-api service. If specified, skips building and uses this image directly.           |
    | `--postgres-uri TEXT`        | Local database            | Postgres URI to use for the database.                                                                                   |
    | `--watch`                    |                           | Restart on file changes                                                                                                 |
    | `--debugger-base-url TEXT`   | `http://127.0.0.1:[PORT]` | URL used by the debugger to access LangGraph API.                                                                       |
    | `--debugger-port INTEGER`    |                           | Pull the debugger image locally and serve the UI on specified port                                                      |
    | `--verbose`                  |                           | Show more output from the server logs.                                                                                  |
    | `-c, --config FILE`          | `langgraph.json`          | Path to configuration file declaring dependencies, graphs and environment variables.                                    |
    | `-d, --docker-compose FILE`  |                           | Path to docker-compose.yml file with additional services to launch.                                                     |
    | `-p, --port INTEGER`         | `8123`                    | Port to expose. Example: `langgraph up --port 8000`                                                                     |
    | `--pull / --no-pull`         | `pull`                    | Pull latest images. Use `--no-pull` for running the server with locally-built images. Example: `langgraph up --no-pull` |
    | `--recreate / --no-recreate` | `no-recreate`             | Recreate containers even if their configuration and image haven't changed                                               |
    | `--help`                     |                           | Display command documentation.                                                                                          |
  </Tab>

  <Tab title="JS">
    Start LangGraph API server. For local testing, requires a LangSmith API key with access to LangSmith. Requires a license key for production use.

    **Usage**

    ```
    npx @langchain/langgraph-cli up [OPTIONS]
    ```

    **Options**

    | Option                                                                    | Default                                                                 | Description                                                                                                   |
    | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
    | <span style={{ whiteSpace: "nowrap" }}>`--wait`</span>                    |                                                                         | Wait for services to start before returning. Implies --detach                                                 |
    | <span style={{ whiteSpace: "nowrap" }}>`--base-image TEXT`</span>         | <span style={{ whiteSpace: "nowrap" }}>`langchain/langgraph-api`</span> | Base image to use for the LangGraph API server. Pin to specific versions using version tags.                  |
    | <span style={{ whiteSpace: "nowrap" }}>`--image TEXT`</span>              |                                                                         | Docker image to use for the langgraph-api service. If specified, skips building and uses this image directly. |
    | <span style={{ whiteSpace: "nowrap" }}>`--postgres-uri TEXT`</span>       | Local database                                                          | Postgres URI to use for the database.                                                                         |
    | <span style={{ whiteSpace: "nowrap" }}>`--watch`</span>                   |                                                                         | Restart on file changes                                                                                       |
    | <span style={{ whiteSpace: "nowrap" }}>`-c, --config FILE`</span>         | `langgraph.json`                                                        | Path to configuration file declaring dependencies, graphs and environment variables.                          |
    | <span style={{ whiteSpace: "nowrap" }}>`-d, --docker-compose FILE`</span> |                                                                         | Path to docker-compose.yml file with additional services to launch.                                           |
    | <span style={{ whiteSpace: "nowrap" }}>`-p, --port INTEGER`</span>        | `8123`                                                                  | Port to expose. Example: `langgraph up --port 8000`                                                           |
    | <span style={{ whiteSpace: "nowrap" }}>`--no-pull`</span>                 |                                                                         | Use locally built images. Defaults to `false` to build with latest remote Docker image.                       |
    | <span style={{ whiteSpace: "nowrap" }}>`--recreate`</span>                |                                                                         | Recreate containers even if their configuration and image haven't changed                                     |
    | <span style={{ whiteSpace: "nowrap" }}>`--help`</span>                    |                                                                         | Display command documentation.                                                                                |
  </Tab>
</Tabs>

### `dockerfile`

<Tabs>
  <Tab title="Python">
    Generate a Dockerfile for building a LangSmith API server Docker image.

    **Usage**

    ```
    langgraph dockerfile [OPTIONS] SAVE_PATH
    ```

    **Options**

    | Option              | Default          | Description                                                                                                     |
    | ------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
    | `-c, --config FILE` | `langgraph.json` | Path to the [configuration file](#configuration-file) declaring dependencies, graphs and environment variables. |
    | `--help`            |                  | Show this message and exit.                                                                                     |

    Example:

    ```bash  theme={null}
    langgraph dockerfile -c langgraph.json Dockerfile
    ```

    This generates a Dockerfile that looks similar to:

    ```dockerfile  theme={null}
    FROM langchain/langgraph-api:3.11

    ADD ./pipconf.txt /pipconfig.txt

    RUN PIP_CONFIG_FILE=/pipconfig.txt PYTHONDONTWRITEBYTECODE=1 pip install --no-cache-dir -c /api/constraints.txt langchain_community langchain_anthropic langchain_openai wikipedia scikit-learn

    ADD ./graphs /deps/__outer_graphs/src
    RUN set -ex && \
        for line in '[project]' \
                    'name = "graphs"' \
                    'version = "0.1"' \
                    '[tool.setuptools.package-data]' \
                    '"*" = ["**/*"]'; do \
            echo "$line" >> /deps/__outer_graphs/pyproject.toml; \
        done

    RUN PIP_CONFIG_FILE=/pipconfig.txt PYTHONDONTWRITEBYTECODE=1 pip install --no-cache-dir -c /api/constraints.txt -e /deps/*

    ENV LANGSERVE_GRAPHS='{"agent": "/deps/__outer_graphs/src/agent.py:graph", "storm": "/deps/__outer_graphs/src/storm.py:graph"}'
    ```

    <Note>The `langgraph dockerfile` command translates all the configuration in your `langgraph.json` file into Dockerfile commands. When using this command, you will have to re-run it whenever you update your `langgraph.json` file. Otherwise, your changes will not be reflected when you build or run the dockerfile.</Note>
  </Tab>

  <Tab title="JS">
    Generate a Dockerfile for building a LangSmith API server Docker image.

    **Usage**

    ```
    npx @langchain/langgraph-cli dockerfile [OPTIONS] SAVE_PATH
    ```

    **Options**

    | Option              | Default          | Description                                                                                                     |
    | ------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
    | `-c, --config FILE` | `langgraph.json` | Path to the [configuration file](#configuration-file) declaring dependencies, graphs and environment variables. |
    | `--help`            |                  | Show this message and exit.                                                                                     |

    Example:

    ```bash  theme={null}
    npx @langchain/langgraph-cli dockerfile -c langgraph.json Dockerfile
    ```

    This generates a Dockerfile that looks similar to:

    ```dockerfile  theme={null}
    FROM langchain/langgraphjs-api:20

    ADD . /deps/agent

    RUN cd /deps/agent && yarn install

    ENV LANGSERVE_GRAPHS='{"agent":"./src/react_agent/graph.ts:graph"}'

    WORKDIR /deps/agent

    RUN (test ! -f /api/langgraph_api/js/build.mts && echo "Prebuild script not found, skipping") || tsx /api/langgraph_api/js/build.mts
    ```

    <Note>The `npx @langchain/langgraph-cli dockerfile` command translates all the configuration in your `langgraph.json` file into Dockerfile commands. When using this command, you will have to re-run it whenever you update your `langgraph.json` file. Otherwise, your changes will not be reflected when you build or run the dockerfile.</Note>
  </Tab>
</Tabs>

***

<Callout icon="pen-to-square" iconType="regular">
  [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/langsmith/cli.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
</Callout>

<Tip icon="terminal" iconType="regular">
  [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
</Tip>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.langchain.com/llms.txt