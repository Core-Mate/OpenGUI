# Video implementation provenance

The scrcpy stream parser/transport and Annex-B decoding were adapted from
`deepseek-harness-plugin/src/scrcpy-stream.ts`, its WebSocket transport and its
browser decoder in this repository. That subtree supplies the MIT license below.
Each host builds and runs its own copy; there is no runtime dependency on DSH.

scrcpy 4.1 is by Genymobile and contributors under Apache-2.0. The installer
retrieves the pinned official distribution and verifies its checksum. Its license
is retained in that distribution: https://github.com/Genymobile/scrcpy/blob/v4.1/LICENSE.

## Upstream subtree license

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
