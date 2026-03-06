# Local Image Captioning for Telegram CLI

## Context

When an AI agent uses the `tg` CLI to read messages, photos are opaque — the agent sees `"content": "photo"` but has no idea what's in the image. The goal is to add local image-to-text captioning so the agent gets a text hint (e.g., "a screenshot of a code editor") without needing to download and analyze the full image with a large model.

### Requirements
- Fast enough to not block CLI workflow (baseline: 200-500ms per CLI request)
- Works on Mac, Windows, Linux without external dependencies
- Doesn't need to be highly accurate — just a rough hint for the agent
- Agent can always download and analyze the image with a better model if needed

## Research: Image-to-Text Models Under 1GB

### Trending Models (HuggingFace, March 2026)

The HF `image-to-text` trending page (1,357 models total) is dominated by OCR models. The captioning-relevant models under 1GB:

| Model | Params | HF Downloads | Released | License | Status |
|-------|--------|-------------|----------|---------|--------|
| **Florence-2-base** (Microsoft) | 231M | 318,446 | Jun 2024 | MIT | Stable, 100+ HF Spaces |
| **SmolVLM-256M-Instruct** (HuggingFace) | 256M | 297,182 | Jan 2025 | Apache 2.0 | Active, 32 Spaces |
| **SmolVLM-500M-Instruct** (HuggingFace) | 507M | 23,320 | Jan 2025 | Apache 2.0 | Low adoption |
| **Mozilla/distilvit** | 182M | 126 | ~2024 | Apache 2.0 | Dead (WIP, 126 downloads) |
| **Moondream2** (vikhyatk) | 1.93B | 4,211,936 | Mar 2024 | Apache 2.0 | Most popular but exceeds 1GB |
| **Moondream 0.5B** | 0.5B | — | Dec 2024 | Apache 2.0 | Smallest full VLM at release |

### Verified Disk Sizes (from HF API)

These are total repo sizes including all variants (ONNX quantized, etc.):
- Florence-2-base: 1.94 GB total repo, ~440 MB fp16 model weight
- SmolVLM-256M: 5.74 GB total repo (many ONNX variants), <1 GB inference
- SmolVLM-500M: 10.6 GB total repo, ~970 MB BF16 model weight
- Moondream2: 129.6 GB total repo (many versions), ~3.6 GB BF16 model weight
- distilvit: 20.98 GB total repo (F32 + ONNX variants), ~400 MB fp16

### Captioning Benchmarks

| Model | CIDEr (COCO) | TextVQA | NoCaps CIDEr | Notes |
|-------|-------------|---------|--------------|-------|
| Florence-2-base (zero-shot) | 133.0 | — | 118.7 | Best captioning in class |
| Florence-2-base-ft (fine-tuned) | 140.0 | 63.6 | 116.7 | Even better with fine-tuning |
| SmolVLM-256M | — | 49.9 | — | No captioning benchmarks published |
| SmolVLM-500M | — | higher | — | Benchmarks in image, not text |
| distilvit | — (ROUGE-1: 60.4) | — | — | Different metric, not comparable |

### Human Evaluation (CapArena)

CapArena is the only human-evaluated captioning benchmark (6,522 annotations). Unfortunately, **no models under 2B were tested** except Qwen2-VL-2B (ranked 18/19, score -48.67). Florence-2, SmolVLM, Moondream are absent from CapArena.

The smallest model tested: Qwen2-VL-2B. Leading models: GPT-4o > Gemini-1.5-pro > Claude-3.5-Sonnet > InternVL2-26B.

### Decision: Florence-2-base

Chosen because:
1. Best captioning quality in the <1GB class (CIDEr 133.0)
2. Highest download count among small captioning models (318K)
3. MIT license
4. ONNX variants available at `onnx-community/Florence-2-base`
5. Supported by transformers.js

SmolVLM-256M was the runner-up (newer, has built-in ONNX) but lacks captioning benchmarks and Florence-2 has stronger proven quality.

## ONNX Quantization Variants

Available at `onnx-community/Florence-2-base`:

| Component | fp32 | fp16 | q4 | int8 |
|-----------|------|------|-----|------|
| vision_encoder | 366.6 MB | 184.0 MB | 81.3 MB | 93.8 MB |
| decoder_model_merged | 388.4 MB | 194.5 MB | 64.4 MB | 98.2 MB |
| encoder_model | 173.4 MB | 86.7 MB | 30.1 MB | 43.7 MB |
| embed_tokens | 157.6 MB | 78.8 MB | 157.6 MB | 39.4 MB |
| **TOTAL** | **1,086 MB** | **544 MB** | **334 MB** | **275 MB** |

Decision: **q4** — 334 MB, 3x smaller than fp32, good quality/size tradeoff.

## Runtime Benchmarks (Mac Apple Silicon M-series)

### Florence-2-base q4, 20 tokens, short caption

| Runtime | Device | Model Load | Per-Image Inference | Total (single) |
|---------|--------|-----------|-------------------|----------------|
| transformers.js v3 (`@huggingface/transformers@3.8.1`) | CPU (WASM) | 715ms | 1,380ms | ~2,100ms |
| **transformers.js v4** (`@huggingface/transformers@next`) | **WebGPU** | **682ms** | **400ms** | **~1,080ms** |
| transformers.js v4 | CoreML | 6,666ms | FAILED | Not compatible with q4 ONNX |
| Ollama (Moondream 1.8B GGUF) | Metal GPU | stays warm | 720ms | 720ms warm |

### Sidecar Impact (model stays loaded)

Without sidecar (fresh process each time):
- fp32 CPU: 3.7s per image (load + inference every time)
- q4 CPU: 2.5s per image

With sidecar (HTTP to warm process):
- q4 CPU: 1.6s per image (inference only, ~0.1s HTTP overhead)
- q4 WebGPU: ~0.5s per image (inference only)

### Batch Processing (5 images, sidecar warm)

| Setup | Time | Per-image |
|-------|------|-----------|
| fp32 CPU, no sidecar | 18.5s (5 × 3.7s) | 3.7s |
| q4 CPU, sidecar | 7.8s | 1.56s |
| q4 WebGPU, sidecar (projected) | ~2.5s | ~0.5s |

### Ollama Detailed Timing (Moondream, Metal)

```
total=720ms  prompt_eval=23ms  eval=632ms  tokens=89 (long caption)
total=190ms  prompt_eval=10ms  eval=120ms  tokens=20 (short caption, cached image)
```
New image: 720ms. Same image repeated: 190ms (Ollama caches image embedding).

## Cross-Platform WebGPU Compatibility

transformers.js v4 uses Dawn (Google's WebGPU C++ implementation) for Node/Bun.

| Platform | WebGPU Backend | Tested | Expected Speed |
|----------|---------------|--------|----------------|
| Mac Apple Silicon | Metal | Yes, 400ms | 400ms |
| Mac Intel | Metal | No | ~600-800ms (weaker GPU) |
| Windows + Nvidia | D3D12/Vulkan | No | ~300-500ms |
| Windows + AMD | D3D12/Vulkan | No | ~400-600ms |
| Windows + Intel iGPU | D3D12 | No | ~800-1200ms? |
| Linux + Nvidia | Vulkan | No | ~300-500ms (if drivers present) |
| Linux + no GPU | — | — | 1,400ms CPU fallback |

Strategy: try WebGPU first, fall back to CPU silently.

## Architecture: Sidecar Process

### Why a sidecar?
Each `tg caption run` is a CLI invocation = new Bun process. Model loading takes 700ms even from cache. A sidecar loads the model once and serves HTTP requests.

### Design
Same pattern as the existing TDLib daemon:
- PID file: `APP_DIR/caption.pid`
- Port file: `APP_DIR/caption.port` (default 7313)
- Auto-spawned by `tg caption run` if not running
- 5-minute idle timeout → auto-shutdown
- HTTP endpoints: `GET /health`, `POST /caption`

### Commands
```
tg caption download          → downloads q4 ONNX model to APP_DIR/models/ (~334 MB)
tg caption run <file...>     → auto-starts sidecar, sends HTTP, returns JSON
```

No start/stop commands — fully automatic lifecycle.

### Result Caching
Cache caption results to avoid re-processing the same image. File hash → caption text. Should persist to disk so cache survives sidecar restart.

## Provider/Library Ecosystem Research

### npm Packages for Inference Providers (weekly downloads, March 2026)

| # | Package | Weekly DL | Type |
|---|---------|-----------|------|
| 1 | `ai` (Vercel AI SDK) | 9,313,314 | Unified SDK |
| 2 | `@ai-sdk/groq` | 940,324 | Groq via AI SDK |
| 3 | `groq-sdk` | 569,638 | Groq native |
| 4 | `@ai-sdk/cohere` | 527,047 | Cohere via AI SDK |
| 5 | `@huggingface/transformers` | 444,375 | Local ONNX inference |
| 6 | `ollama` | 431,626 | Local (GGUF) |
| 7 | `@ai-sdk/cerebras` | 408,793 | Cerebras via AI SDK |
| 8 | `cohere-ai` | 401,672 | Cohere native |
| 9 | `replicate` | 365,629 | Replicate native |
| 10 | `@huggingface/inference` | 347,508 | HF cloud API |
| 11 | `@fal-ai/client` | 328,063 | fal.ai native |
| 12 | `@ai-sdk/togetherai` | 284,587 | Together via AI SDK |
| 13 | `@ai-sdk/fireworks` | 161,030 | Fireworks via AI SDK |
| 14 | `@cerebras/cerebras_cloud_sdk` | 71,233 | Cerebras native |
| 15 | `fireworks-js` | 62,358 | Fireworks native |
| 16 | `@ai-sdk/replicate` | 49,993 | Replicate via AI SDK |
| 17 | `together-ai` | 37,390 | Together native |
| 18 | `@ai-sdk/fal` | 25,499 | fal via AI SDK |
| 19 | `@scaleway/sdk` | 9,253 | Scaleway native |
| 20 | `novita-sdk` | 366 | Novita native |

No npm packages found for: Hyperbolic, Nscale, SambaNova, Featherless AI, Zai, Public AI, OVHcloud, WaveSpeed.

### Providers That Support Local + Cloud

| Provider/Tool | Local | Cloud | Unified API | Vision Models |
|---------------|-------|-------|-------------|---------------|
| HuggingFace (`@huggingface/transformers` + `@huggingface/inference`) | ONNX in-process | HF Inference API | Mostly | Florence-2, SmolVLM |
| Ollama | GGUF native | No (local only) | REST API | LLaVA, Moondream |
| Vercel AI SDK (`ai`) | Via adapters | All major providers | Yes | Depends on provider |

### Cloud Captioning Costs (for reference)

| Provider | Model | Price/image | Speed |
|----------|-------|------------|-------|
| fal.ai | Florence-2-large | ~$0.0003 (A100 @ $0.99/hr) | ~200-500ms |
| HuggingFace Inference | Florence-2 | ~$0.001-0.005 | varies |
| OpenAI | GPT-4o-mini vision | ~$0.003 (low-res) | ~500ms |

### fal.ai Vision Models Available
- Florence-2 Large (`fal-ai/florence-2-large/caption`)
- LLaVA v1.6 34B (`fal-ai/llava-next`)
- Moondream2, MoondreamNext, Moondream 3 Preview
- Any VLM (`fal-ai/any-llm/vision`) — routes through OpenRouter

### HuggingFace Inference Providers (from HF UI)
Groq, Novita, Cerebras, SambaNova, Nscale, fal, Hyperbolic, Together AI, Fireworks, Featherless AI, Zai, Replicate, Cohere, Scaleway, Public AI, OVHcloud AI Endpoints, HF Inference API, WaveSpeed

## RAG/Embedding Search for Messengers

### The Problem
Messenger search (including Telegram's built-in) is keyword-based — misses semantic matches and doesn't understand conversation context. "The plumber's number is 555-1234" won't be found when searching "contractor contact info."

### Architecture
```
Messages → Chunking → Embeddings → Vector DB
                                        |
User Query → Query Embedding → Hybrid Search → Reranker → Results (→ LLM summary)
```

### Chunking Strategy for Chat Messages
- Individual messages are too short for meaningful embeddings
- Group messages into conversation threads/topics using reply chains
- The `telegram_rag_search` project (GitHub: DmitriiK) builds discussion trees from reply chains, groups adjacent messages, uses LLM to determine topic boundaries
- Chunk size ~512 tokens for message groups
- Sliding window with 10-20% overlap for non-threaded conversations
- Store metadata: timestamp, sender, chat ID, reply-to links
- Filter noise: skip "ok", "thanks", system messages, emoji reactions

### Hybrid Search: BM25 + Vector (Consensus)
Don't use vector-only search. Hybrid search combining keyword (BM25) and semantic (vector) retrieval performs significantly better.

- **BM25**: exact matches — names, phone numbers, URLs, codes, product IDs. No semantic meaning to embedding models.
- **Vector search**: intent and paraphrasing — "how to fix the leak" matches "plumbing repair instructions."
- **RRF (Reciprocal Rank Fusion)**: best starting point for combining scores — simple, robust, no tuning.

### Query Pipeline
```
User query → Embed → BM25 (top 20) + Vector (top 20) → RRF merge → Cross-encoder reranker (top 5) → Results
```

### Embedding Models
- **OpenAI text-embedding-3-small** — good default, cheap, fast
- **E5-Large-V2 / E5-Mistral** — best open-source
- **all-MiniLM-L6-v2** — lightweight for local/edge
- For non-English: translate to English first, or use `multilingual-e5-large`

### Vector Databases
| DB | Good for |
|---|---|
| SQLite + sqlite-vec | Local/embedded, small scale |
| PostgreSQL + pgvector | Already using Postgres |
| Qdrant | Dedicated, good filtering |
| ChromaDB | Prototyping |
| Elasticsearch | Already using ES, hybrid search built-in |

### Key Gotchas
1. Lost-in-the-middle problem — info buried in middle of retrieved chunks gets missed
2. Short messages embed poorly — filter or group them
3. Temporal context — messages 5 min apart are related; 5 days apart probably aren't
4. Don't embed everything — skip system messages, join/leave, pure emoji

### Multi-Language (Russian/Mixed Chats)
Two approaches:
- Translate → embed in English (simpler, better model availability)
- Multilingual embedding model (`multilingual-e5-large`, 100+ languages natively)

### Production Concerns
- Incremental indexing: embed new messages on arrival, don't re-embed everything
- Query latency target: <100ms retrieval
- Cache hot vectors in memory with TTL
- Batch embed during historical backfill

## Current Implementation State

### Files Modified
- `apps/cli/src/commands/caption.ts` — download + run commands with sidecar lifecycle
- `apps/cli/src/commands/caption-sidecar.ts` — background HTTP server, loads model once
- `apps/cli/src/index.ts` — registered caption command
- `apps/cli/package.json` — added `@huggingface/transformers@3.8.1`

### Model Downloaded
- q4 variant at `~/Library/Application Support/dev.telegramai.app/models/onnx-community/Florence-2-base/onnx/`
- Files: vision_encoder_q4.onnx (78MB), decoder_model_merged_q4.onnx (61MB), encoder_model_q4.onnx (29MB), embed_tokens_q4.onnx (150MB)
- Total: 334 MB

### Also Installed (for benchmarking)
- Ollama + Moondream model (~828 MB)
- transformers.js v4 in `/tmp/tfjs-gpu-test/`

### TODO
- [ ] Upgrade sidecar to `@huggingface/transformers@next` (v4) for WebGPU support
- [ ] Add WebGPU → CPU fallback detection in sidecar
- [ ] Add result caching (file content hash → caption text), persist to disk
- [ ] Clean up: remove v3 dependency, use v4 only
- [ ] Test cross-platform (Windows, Linux)
- [ ] Consider: should `--auto-download` in msg search also auto-caption?

## Sources
- [onnx-community/Florence-2-base](https://huggingface.co/onnx-community/Florence-2-base)
- [microsoft/Florence-2-base](https://huggingface.co/microsoft/Florence-2-base)
- [HuggingFaceTB/SmolVLM-256M-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct)
- [Transformers.js v4 Preview](https://huggingface.co/blog/transformersjs-v4)
- [CapArena Captioning Benchmark](https://caparena.github.io/)
- [Open VLM Leaderboard](https://huggingface.co/spaces/opencompass/open_vlm_leaderboard)
- [DmitriiK/telegram_rag_search](https://github.com/DmitriiK/telegram_rag_search)
- [Hybrid Search: BM25 + Vector](https://medium.com/@mahima_agarwal/hybrid-search-bm25-vector-embeddings-the-best-of-both-worlds-in-information-retrieval-0d1075fc2828)
- [Chunking Strategies for RAG (Weaviate)](https://weaviate.io/blog/chunking-strategies-for-rag)
- [fal.ai Florence-2](https://fal.ai/models/fal-ai/florence-2-large/caption/api)
