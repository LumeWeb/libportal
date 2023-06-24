package main

import (
	"bytes"
	"io"
	"lukechampine.com/blake3"
	"math/rand"
	"strconv"
	"syscall/js"
)

var activeReader *reader
var pipe chan []byte
var callbackId int
var nextBytes chan int
var killChan chan bool

func main() {
	pipe = make(chan []byte)
	nextBytes = make(chan int)
	killChan = make(chan bool)
	callbackId = rand.Int()
	<-killChan
}

type reader struct {
}

func (r *reader) Read(p []byte) (n int, err error) {
	nextBytes <- len(p)
	data := <-pipe
	copy(p[:], data[:])
	resetWritePromise()
	return len(data), nil
}

//export start
func start() int {

	rootChan := make(chan []byte)
	proofChan := make(chan []byte)

	resetWritePromise()
	setGlobalObject(getGlobalPrefix()+"_set_root", js.FuncOf(func(this js.Value, args []js.Value) any {
		jsroot := args[0]

		root := make([]byte, jsroot.Get("length").Int())
		js.CopyBytesToGo(root, jsroot)

		rootChan <- root

		return nil
	}))

	setGlobalObject(getGlobalPrefix()+"_set_proof", js.FuncOf(func(this js.Value, args []js.Value) any {
		jsproof := args[0]

		proofSlice := make([]byte, jsproof.Get("length").Int())
		js.CopyBytesToGo(proofSlice, jsproof)

		proofChan <- proofSlice

		return nil
	}))

	setGlobalObject(getGlobalPrefix()+"_write", js.FuncOf(func(this js.Value, args []js.Value) any {
		d := args[0]
		data := make([]byte, d.Get("length").Int())
		js.CopyBytesToGo(data, d)

		pipe <- data

		return nil
	}))

	go func() {
		rootSlice := <-rootChan
		proof := <-proofChan

		var root [32]byte

		copy(root[:], rootSlice)

		ret, err := blake3.BaoDecode(io.Discard, activeReader, bytes.NewReader(proof), root)
		setGlobalObject(getGlobalPrefix()+"_result", ret)
		setGlobalObject(getGlobalPrefix()+"_error", err)
	}()

	return callbackId
}

//export kill
func kill() {
	killChan <- true
}

func createWritePromiseHandler() js.Value {
	return createPromiseHandler(func(this js.Value, args []js.Value) {
		bytesToRead := <-nextBytes
		args[0].Invoke(bytesToRead)
	})
}

func createPromiseHandler(cb func(this js.Value, args []js.Value)) js.Value {
	return js.Global().Get("Promise").New(js.FuncOf(func(this js.Value, args []js.Value) any {
		cb(this, args)
		return nil
	}))
}

func getGlobalPrefix() string {
	return "bao_" + strconv.FormatInt(int64(callbackId), 10)
}

func getWritePromiseName() string {
	return getGlobalPrefix() + "_write_promise"
}

func resetWritePromise() {
	setGlobalObject(getWritePromiseName(), createWritePromiseHandler())
}

func setGlobalObject(name string, p any) {
	js.Global().Set(name, p)
}
