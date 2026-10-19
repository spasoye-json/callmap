// The Go extractor as a CLI: a separate process that reads a repo and writes its reference
// graph document to standard output (ADR-0009). Nothing but the document goes to standard
// output, so the caller can pipe it straight into the core. A refusal goes to standard
// error with a non-zero exit, so a repo it could not read is never mistaken for a repo with
// nothing in it.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

const usage = "usage: callmap-extract-go <repo> [--scope <glob>]..."

type invocation struct {
	repo  string
	scope []string
}

// readArguments refuses a flag it does not know and a value that follows no flag, rather than
// ignoring them, because an unread --scope would emit a document over the whole repo and read as
// if that were what was asked for.
func readArguments(args []string) (invocation, error) {
	read := invocation{scope: []string{}}
	for index := 0; index < len(args); index++ {
		argument := args[index]
		switch {
		case argument == "--scope":
			if index+1 >= len(args) || strings.HasPrefix(args[index+1], "--") {
				return read, errors.New("--scope needs a value after it")
			}
			read.scope = append(read.scope, args[index+1])
			index++
		case strings.HasPrefix(argument, "--"):
			return read, fmt.Errorf("%s is not a flag this extractor knows", argument)
		case read.repo == "":
			read.repo = argument
		default:
			return read, fmt.Errorf("'%s' follows no flag; only one repo is read at a time", argument)
		}
	}
	if read.repo == "" {
		return read, errors.New(usage)
	}
	return read, nil
}

func run(args []string) error {
	read, err := readArguments(args)
	if err != nil {
		return err
	}
	doc, err := extract(read.repo, read.scope)
	if err != nil {
		return err
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	_, err = os.Stdout.Write(append(out, '\n'))
	return err
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
