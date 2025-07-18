---
title: Brief Notes on 6.824 Lab 1
description: |
  Brief notes on my implementation of 6.824 Lab 1.
authors:
  - duskmoon
tags:
  - notes
  - go
  - "6.824"
---

# Brief Notes on 6.824 Lab 1

Brief notes on my implementation of 6.824 Lab 1.

<!-- truncate -->

## Background

Big data processing lacked an effective paradigm until Google published MapReduce in 2004, which introduced the classic `map` and reduced concepts from functional programming into the field of big data processing. The introduction of this concept greatly simplified the process of data processing, making it possible to process various data in a unified way. Although nearly twenty years have passed, the processing of big data has made great progress, but MapReduce is still an important starting point for us to understand distributed systems.

In functional programming, `map` and `reduce` are two very classic functions for processing arrays. For example, in JavaScript and Rust, we can use them to build new arrays or sum them up:

**JavaScript**

```js
const array = [1, 2, 3, 4]

const map_res = array.map((x) => x * 2)
console.log(map_res)
// [2, 4, 6, 8]

const reduce_res = array.reduce((acc, x) => acc + x, 0)
console.log(reduce_res)
// 10
```

- [Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
- [Array.prototype.reduce()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)

**Rust**

```rust
let a = [1, 2, 3, 4];

let map_res = a.iter().map(|x| x * 2).collect::<Vec<i32>>();
println!("{:?}", map_res);
// [2, 4, 6, 8]

let reduce_res = a.iter().fold(0, |acc, x| acc + x);
println!("{}", reduce_res);
// 10
```

- [Iterator::map()](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.map)
- [Iterator::fold()](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.fold)

For larger-scale data, the data to be processed can always be constructed as `{Key: Value}`, and then `map` and `reduce` can be used to process the data. For example, we can count the occurrences of words in an article:

```rust
map(String key, String value):
  // key: document name
  // value: document contents
  for each word w in value:
    EmitIntermediate(w, "1");

reduce(String key, Iterator values):
  // key: a word
  // values: a list of counts
  result = 0
  for each v in values:
    result += ParseInt(v)
  Emit(AsString(result))

// See "MapReduce: Simplified Data Processing on Large Clusters"
```

The function of this pseudo-code is straightforward: First, we split the document into words and generate an intermediate product of many `<word> 1`. Then, we aggregate the intermediate product and get the word count result.

Based on this paradigm, [MapReduce] designed a framework for distributed execution, which includes a management node (`Master`) and multiple `Worker` nodes (`Worker`). In the two stages of the entire execution (`Map` and Reduce), the `Master` assigns the tasks to be executed to the `Worker`, and the `Worker` returns the results to the `Master` after completing the tasks. Finally, the `Master` summarizes the results of all `Worker`s to obtain the final result.

![The framework of MapReduce](../../../../../blog/2023/01-20-6.824-lab1/mapreduce.png)

> The framework of MapReduce [(REF)][mapreduce]

## Lab 1

The task of Lab 1 is to implement the functionality of the `Coordinator` (i.e., `Master`) and `Worker` on the given framework. The experimental framework is written in Go language, and the RPC template code required has been provided. Therefore, we only need to learn GO language and MapReduce and understand the framework's logic.

### Design

First, it is necessary to clarify what information the `Coordinator` needs to maintain. Information about the tasks is necessary, including the corresponding files, start time, status, etc. Whether the information about the `Worker` needs to be maintained is a question that needs to be discussed. It seems that in many MapReduce systems, the `Coordinator` records the status of the `Worker`, the tasks it holds, and other information for task scheduling and error handling. However, in the simple framework of Lab 1, I believe that the information about the `Worker` does not need to be maintained and can be processed according to the flowchart shown below:

![mr_flow](../../../../../blog/2023/01-20-6.824-lab1/mrflow.excalidraw.svg)

1. The `Coordinator` reads the entire task, divides it into several `Map` tasks, and prepares to assign them to the `Worker`.
2. The `Worker` requests a task through `GetTask`, and the `Coordinator` assigns a task from the idle `Map` tasks to the `Worker`, recording the start time of the task.
3. The `Coordinator` periodically checks whether any tasks have timed out and, if so, returns them to the idle `Map` task pool.
4. After the `Worker` completes the task, it reports the task result through `UpdateTask`, and the `Coordinator` removes the task from the idle `Map` task pool and records the necessary information for building the `Reduce` task.
5. Repeat steps 2-4 until all `Map` tasks are completed.
6. Based on the results of the `Map` phase, the `Coordinator` builds the `Reduce` task and prepares to assign it to the `Worker`.
7. Similar to steps 2-4, the `Worker` receives and executes the task, and the `Coordinator` checks for task timeouts and reassigns tasks.
8. After all `Reduce` tasks are completed, necessary work can be done before exiting.

Considering that the `Worker` that executes the task can manage its own state, the Coordinator doesn't need to record information about the `Worker`. This is somewhat similar to process scheduling in an operating system, where each core takes tasks from the ready queue to execute, rather than the scheduler recording the status of each core. The advantage of this design is that the `Coordinator` only needs to maintain information about the tasks and wait for the `Worker` to initiate a request. If the `Coordinator` does not receive a report even after the `Worker` requests and assigns a task until it times out, it is considered that the `Worker` has made an error, and the task can be reassigned.

If we want to further implement the saving and restoring of intermediate task states, adding support for the `UpdateTask` function may be sufficient. There is still no need to maintain information about the `Worker` at the `Coordinator`.

### Implementation summary

#### Debugging

The lab guide mentions using `DPrintf` for debugging. However, this function is not provided in the Lab 1 framework, so copying it from the framework of subsequent labs is a good choice.

However, it may be better to implement colored and graded logging output in future labs. We can consider implementing on in subsequent labs.

#### Worker

In my design, the structure of the `Worker` is straightforward: it continuously requests tasks in a loop and decides the next step based on whether it is `Map`, `Reduce`, or `Exit`. However, it should be noted that sometimes there are no idle tasks when the `Worker` requests a task, so it needs to wait for some time. I put this waiting time in the `Coordinator` and the `Worker` blocks at `GetTask`. Upon careful consideration, this design is not very reasonable, as it may result in the `Coordinator` assigning new tasks to a `Worker` that no longer exists after the `Worker` times out, which has a certain impact on overall performance.

#### Coordinator

There are two approaches to implementing the Coordinator:

1. Use a big lock to synchronize all operations.
2. Use a separate thread to perform all data operations and communicate with the thread through channels for all external interfaces.

The former implementation may be simpler, but Go seems to prefer using channels. Therefore, I chose the latter approach for implementation, and the general framework is shown in the following diagram:

![mr_coordinator](../../../../../blog/2023/01-20-6.824-lab1/mrcoordinator.excalidraw.svg)

The main processing logic of the `Coordinator` is in the separate thread `process`.

1. The `GetTask` and `UpdateTask` received by the `Coordinator` are both notified to `process` through `reqChan`. The `process` then processes them and puts the new task into `taskChan` for response to `GetTask` or updating the task status passed in by `UpdateTask`.
2. The `Coordinator` maintains a timer to check for tasks that may time out periodically. Initially, I thought it was only necessary to check when the `Worker` requested a task, so this check was triggered when `GetTask` was called. However, since `GetTask` is blocked at the `Coordinator` in my implementation, the significance of this check is not very significant.
3. When the task update triggered by `UpdateTask` causes the entire system's state to change from `Map` to `Reduce` and then to `Exit`, a signal is sent to `doneChan` for the final exit.

#### Pitfalls

The interaction between the `Worker`, the `Coordinator`, and the management of their respective states is the difficult part of the implementation. If done incorrectly, it is easy to cause deadlocks (or livelocks? I haven't analyzed it carefully). Then you will encounter situations where the tests cannot be passed, but you don't know why (lol).

It is very necessary to use `DPrintf` to print logs to help understand what your implemented system is doing.

## Miscellaneous

This is my first time using the Go language. While trying to implement Lab 1, I always wanted to write functions like `.filter()` and `.forEach()`, but Go does not provide these functions, and you need to use `for` loops to achieve the desired functionality. Strangely, a language that provides various network-related tools in its standard library does not provide some basic methods. Moreover, Go's syntax has many "appearance" differences from Rust and JavaScript, which I am familiar with, giving me a feeling of using a dialect of C++.

In short, I don't really like Go.

## Reference

1. [Dayalan, M. (2004). MapReduce: simplified data processing on large clusters. CACM.][mapreduce]
2. [6.824: Distributed Systems][6.824]

[6.824]: https://pdos.csail.mit.edu/6.824/index.html
[mapreduce]: https://api.semanticscholar.org/CorpusID:67055872
