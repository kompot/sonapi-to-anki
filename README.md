# Create [Anki](https://apps.ankiweb.net/) cards from [SõnAPI](https://www.sonapi.ee/)/[Sõnaveeb](https://sonaveeb.ee/)

So you are on the path of improving your Estonian skills and want to learn some words?

Then just create a text file where each line contains a word and then run

```shell
just create-cards sonaveeb-a1.txt sonaveeb-a1-deck.txt
```

This repo contains 5 sets of exported words (with slight modifications) from [Sõnaveeb dictionary](https://sonaveeb.ee/teacher-tools/#/vocabulary).

```shell
sonaveeb-a1.txt
sonaveeb-a2.txt
sonaveeb-b1.txt
sonaveeb-b2.txt
sonaveeb-c1.txt
```

So you can just create 5 standard decks.

## Prerequisites

[Deno](https://deno.com/) and [Just](https://github.com/casey/just). On macOS just (pun intended) install it with [Homebrew](https://brew.sh/).

```
brew install deno just
```

## How it works

1. Parses input txt files, first column of a tab-delimited input file is considered the word to search in `SõnAPI`.
2. Fetches this word data from `SõnAPI` and caches results into a file so not to abuse `SõnAPI`.
3. If _all_ the words have non-empty results then the output deck is created. Otherwise you need to either remove the word from input file or correct it (for example some words in raw `Sõnaveeb` export had their 2nd form in parentheses thus making it unsearchable in `SõnAPI`).

## What's to be done

1. Right now translation language of the cards is hardcoded (Russian). Will add options to customize language priority (so in case translation in your preferred language is missing then fallback to another one).
2. Card template is pretty basic and also hardcoded. Will make it customizable.
3. Maybe add more output formats, not only `Anki`?
