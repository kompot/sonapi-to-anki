import * as csv from "std-csv";
import * as fs from "std-fs";

import { File } from "cmd-ts/dist/cjs/batteries/fs.js";

import { command, option, string } from "cmd-ts";

const externalAPIs = ["sonapi_v2"] as const;

type ExternalAPI = (typeof externalAPIs)[number];

const searchTermParamName = "word";

const externalApiUrls = {
  sonapi_v2: (searchTerm: string) => `https://api.sonapi.ee/v2/${searchTerm}`,
} as const satisfies Record<ExternalAPI, (searchTerm: string) => string>;

// https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
type LangCode = "eng" | "fra" | "rus" | "ukr";

type ExternalApiReturnTypes = {
  sonapi_v2: {
    requestedWord: string;
    estonianWord: string;
    searchResult: Array<{
      wordClasses: string[];
      wordForms: Array<{
        inflectionType: string;
        code: "SgN" | "SgG" | "SgP" | "PlN" | "PlG" | "PlP" | string;
        morphValue: string;
        value: string;
      }>;
      meanings: Array<{
        definition: string;
        partOfSpeech: Array<{ code: string; value: string }>;
        examples: string[];
        synonyms: string[];
        translations: Partial<
          Record<LangCode, Array<{ words: string; weight: number }>>
        >;
      }>;
      similarWords: string[];
    }>;
    translations: Array<unknown>;
  };
};

const localPort = 8080;

function createCachingProxy({ delay }: { delay: number }) {
  const cacheDir = "cache";
  externalAPIs.forEach((e) => {
    Deno.mkdirSync(`${cacheDir}/${e}`, { recursive: true });
  });

  const cachingProxyServer = Deno.serve(
    { port: localPort },
    async (request) => {
      const { pathname, search } = new URL(request.url);
      const usr = new URLSearchParams(search);
      const searchTerm = usr.get(searchTermParamName);
      if (!searchTerm) {
        return new Response("No search term supplied.", { status: 400 });
      }
      const [, api] = pathname.split("/");
      const externalApi = api as ExternalAPI;
      const url = new URL(externalApiUrls[externalApi](searchTerm));

      const dirPath = `${cacheDir}/${externalApi}/${searchTerm.slice(0, 2)}`;
      Deno.mkdirSync(dirPath, { recursive: true });
      const cachedJsonPath = `${dirPath}/${searchTerm}.json`;
      if (fs.existsSync(cachedJsonPath)) {
        const cachedResponse = Deno.readTextFileSync(cachedJsonPath);
        return new Response(cachedResponse, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log("HTTP request to external API:", url.href);
      const fetchedRemote = await fetch(url, {
        method: request.method,
        body: request.body,
        redirect: "manual",
      });

      const resultJson = await fetchedRemote.json();

      if (
        (resultJson as ExternalApiReturnTypes[ExternalAPI]).searchResult
          .length === 0
      ) {
        return new Response("Search term not found.", { status: 404 });
      }

      const textContent = JSON.stringify(resultJson, null, 2);
      Deno.writeTextFileSync(cachedJsonPath, textContent);

      return new Response(textContent, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  );
  return cachingProxyServer;
}

function convertWordDataToAnkiCard(
  wordData: ExternalApiReturnTypes["sonapi_v2"]
): string {
  let cardFront = "";
  let cardBack = "";
  wordData.searchResult.forEach((sr, idx1) => {
    cardFront += "<ol>";
    cardBack += "<ol>";
    sr.meanings.forEach((meaning, idx2) => {
      cardFront += `<li>${meaning.definition}<br>`;
      // TODO customise translations here
      const allMeanings =
        meaning.translations.rus?.flatMap((i) => {
          const spl = i.words.split(",");
          return spl.map((s) => ({
            word: s,
            weight: i.weight,
          }));
        }) || [];
      const allMeaningsSorted = allMeanings
        .sort((a, b) => b.weight - a.weight)
        // probably we don't need more than 5 translations
        .slice(0, 5);

      cardBack += `<li>${allMeaningsSorted
        .map((i) => {
          if (i.weight == 1) {
            return i.word;
          }
          return `<span style="opacity: ${i.weight / 1.7}">${i.word}</span>`;
        })
        .join(", ")}</li>`;
      cardFront += "<ul>";
      meaning.examples.forEach((example) => {
        cardFront += `<li>${example}</li>`;
      });
      cardFront += "</ul>";
      cardFront;
    });
    cardBack += "</ol>";
    cardFront += "</ol>";
  });
  return `${wordData.estonianWord}<br>${cardFront}|${cardBack}`;
}

async function fetchAndCache<T extends ExternalAPI>(
  externalApi: T,
  word: string
): Promise<ExternalApiReturnTypes[T]> {
  const resp = await fetch(
    `http://localhost:${localPort}/${externalApi}?${searchTermParamName}=${word}`
  );

  if (resp.status !== 200) {
    throw new Error(`No results fetched for ${word}`);
  }

  return await resp.json();
}

export const cmdCreateCards = command({
  name: "create-cards",
  description: "Create Anki cards",
  args: {
    inputFile: option({
      long: "input-file",
      type: File,
      description: "Input file",
    }),
    outputFile: option({
      long: "output-file",
      type: string,
      description: "Output file",
    }),
  },
  handler: async ({ inputFile, outputFile }) => {
    const cachingProxyServer = createCachingProxy({ delay: 1000 });

    const inputFileContents = await Deno.readTextFile(inputFile);

    const parsed = csv.parse(inputFileContents, { separator: "\t" });
    const allLines = parsed;
    console.log(`Will fetch ${allLines.length} words`);

    let skipCreation = false;
    for (const words of allLines) {
      const word = words[0];
      if (word.startsWith("#")) {
        console.log("Skipping commented word", word);
        continue;
      }
      try {
        await fetchAndCache("sonapi_v2", word);
      } catch (err: unknown) {
        console.error(`Word ${word} was not fetched.`);
        console.error(err);
        skipCreation = true;
      }
    }

    if (skipCreation) {
      console.error("Some words were not fetched, skipping card creation.");
    } else {
      await Deno.writeTextFile(
        outputFile,
        `#separator:pipe
#html:true
`,
        {
          create: true,
        }
      );
      // Create Anki cards
      let buffer: string = "";
      for (const words of allLines) {
        const word = words[0];
        if (word.startsWith("#")) {
          console.log("Skipping commented word", word);
          continue;
        }
        const wordData = await fetchAndCache("sonapi_v2", word);
        console.log(`Creating card for ${word}`);
        buffer += convertWordDataToAnkiCard(wordData) + "\n";
      }
      await Deno.writeTextFile(outputFile, buffer, {
        append: true,
        create: false,
      });
    }

    await cachingProxyServer.shutdown();
  },
});
