default:
  @just --list

create-cards INPUT_FILE OUTPUT_FILE:
  deno run --allow-write=. --allow-net --allow-read --allow-env main.ts create-cards --input-file {{INPUT_FILE}} --output-file {{OUTPUT_FILE}}
