---
title: "6.824 Lab 2 简记（零）: 一个漂亮的 Logger"
description: |
  从本文开始，我将分享 6.824 Lab 2 的实现思路和一些我遇到的问题。
  本文是 Lab 2 部分的第零篇，主要分享如何使用 Go 的标准库实现一个功能更丰富的 `Logger`。
authors:
	- duskmoon
tags:
  - 学习笔记
  - go
  - "6.824"
---

# 6.824 Lab 2 简记（零）: 一个漂亮的 Logger

从本文开始，我将分享 6.824 Lab 2 的实现思路和一些我遇到的问题。
本文是 Lab 2 部分的第零篇，主要分享如何使用 Go 的标准库实现一个功能更丰富的 `Logger`。

<!-- truncate -->

## 调试分布式系统是痛苦的

在 6.824 的 Lab 2 中，我们需要实现 Raft 这一广为人知的分布式共识协议。在进行 Raft 实现时我遇到的最大困难并非理解 Raft 的算法或是将算法转化为 Go 代码，而是遇到与预期不符的行为时如何进行调试。

调试从来都不是一个容易的事情，而在分布式系统中调试的难度更是单线程程序的数倍。对于一个单线程程序，我们可以简单地打印日志或是使用 gdb 等工具轻松地定位问题。在调试分布式系统中两种方法仍然可用，但是并行的多个进程或线程会产生大量的日志，使得我们很难从中找到有用的信息；而 gdb 等工具也不如单线程程序中那么简单易用。因此，我们需要有一种更好的调试方法，一个虽然不复杂但是能够提供足够的信息供我们完成实验的工具。

Jose Javier Gonzalez Ortiz 在他的博客 [_Debugging by Pretty Printing_][debugging-pretty] 中分析了调试分布式系统的基本需求：我们需要知道**谁**在**何时**做了**什么**。基于这个分析，他让 Raft 的 Go 部分输出了一定格式的日志，然后利用 Python 进行解析。我的实现深受他的影响，但是我并没有使用 Python，而是仅使用了 Go 的标准库与 ANSI Escape Code 来实现一个功能丰富的 Logger。

## 需求分析

在实现 Logger 之前，我们需要先分析一下我们需要什么样的 Logger。在这里，我列出了我认为 Logger 需要满足的需求：

1. **来源**：我们需要知道日志来自哪个节点，以便于分析分布式系统中事情发生的顺序。
2. **时间**：我们需要知道日志发生的时间，以便于分析分布式系统中事情发生的间隔。
3. **等级**：日志有不同的等级，如 `error`、`warn`、`info` 等，我们需要能够根据日志等级来过滤日志。
4. **主题**：日志主题是日志的分类，如 `Leader`、`Client`、`Vote` 等，我们需要能够根据日志主题来过滤日志。
5. **颜色**：我们需要可开启的颜色支持，以便于区分不同的日志等级和主题。
6. **易于配置**：我们可以使用环境变量或是其他方式来配置 Logger。

其中，来源实际上与输出的信息有关，Logger 本身并不需要关心。因此，我们的目标是实现另外的五个需求。

## 实现

### 从 Go 的 log 开始

Go 的标准库中提供了一个 `log` 包，我们可以使用它来输出这样的日志：

```
2009/01/23 01:23:23.123123 /a/b/c/d.go:23: message
```

这个日志的信息过于丰富，很多时候我们并不需要这么多信息，甚至时间信息都超出了我们的需求，不如将所有信息都关闭而自行封装输出的内容。根据 `log` 的文档，输出信息都是围绕着 `log.Logger` 进行的，因此我们可以通过定制 `log.Logger` 来实现我们的需求。回顾上一节的需求，我们可以定义一个 `Logger` 结构体和其初始化函数：

```go
type Logger struct {
  logger *log.Logger // 用于输出日志的 log.Logger
  level  LogLevel    // 日志等级，用于过滤日志
  filter []string    // 日志主题过滤器
  color  bool        // 是否开启颜色支持
  start  time.Time   // 日志开始时间
}

func NewLogger() *Logger {
  // TODO: 获取 Logger 的配置

  return &Logger{
    logger: log.New(os.Stdout, "", 0),
    // TODO: 初始化 Logger 的其他字段
  }
}

func (l *Logger) time() int64 {
	return time.Since(l.start).Microseconds()
}
```

这里我们使用空字符串作为 `log.Logger` 的前缀，并且关闭了所有信息的输出。这几乎就是一个普通的 `Print` 函数，但还有 `log.Logger` 的函数可以使用。（虽然我最后并没有使用 `Printf` 以外的函数）

### 日志等级

我们在需求分析中提到了需要将日志分为几个等级，用于进行过滤。那么应该分为哪些等级并且如何实现呢？在 Rust 的 `log` 库中，日志被分为 5 个等级并提供不同等级的输出宏：

```rust
use log::{debug, error, info, trace, warn};

fn main() {
    trace!("trace");
    debug!("debug");
    info!("info");
    warn!("warn");
    error!("error");
}
```

这 5 个等级是递进的，即 `trace` 的输出最多，`error` 的输出最少。这看上去是一个不错的选择，因此我们仿照它定义 `LogLevel` 和相应的输出函数：

```go
type LogLevel uint8

const (
  LogError LogLevel = iota
  LogWarn
  LogInfo
  LogDebug
  LogTrace
)

var llsMap = map[LogLevel]string{
	LogError: "ERROR",
	LogWarn:  "WARN",
	LogInfo:  "INFO",
	LogDebug: "DEBUG",
	LogTrace: "TRACE",
}

func (l *Logger) log(level LogLevel, format string, a ...interface{}) {
	if level > l.level {
		return
	}
	var prefix string
	prefix += fmt.Sprintf("%08d [%6s]", l.time(), llsMap[level])
	l.logger.Printf(prefix+format+"\n", a...)
}

func (l *Logger) Error(format string, a ...interface{}) {
  l.log(LogError, format, a...)
}

// 其他等级的输出函数
```

这里我们定义了一个 `log` 函数以复用日志输出的逻辑，然后定义了 `Error` 等级的输出函数，其他等级的输出函数类似。在 `log` 中我们使用 `>` 来判断日志等级是因为等级是用 `uint8` 表示的，如 `LogError` 的值为 0，而 `LogTrace` 的值为 4。我们还定义了一个 `llsMap` 来将日志等级转化为字符串，以便于在前缀中使用，方便我们阅读日志。

### 日志主题

在需求分析中，我们还提到了日志需要有主题以便于进一步区分不同内容的日志。在实现中，我将 `error`、`warn` 和 `info` 用于少量的关键信息，而 `trace` 用于输出大量的锁的信息，因此日志的主题仅在 `debug` 等级中使用。我根据 Raft 的逻辑将日志主题分为了 8 种：

```go
type LogTopic string

const (
	dLeader  LogTopic = "LEADER"  // Leader 当选、发送心跳等
	dClient  LogTopic = "CLIENT"  // 变为 Follower 与接收心跳等
	dCommit  LogTopic = "COMMIT"  // 提交日志
	dVote    LogTopic = "VOTE"    // 投票开始及相关 RPC
	dTimer   LogTopic = "TIMER"   // 定时器
	dPersist LogTopic = "PERSIS"  // 持久化状态
	dSnap    LogTopic = "SNAP"    // 快照

	dDefault LogTopic = "DEFAULT" // 默认主题
)
```

我们使用 `string` 来表示日志主题，因而可以直接和配置的过滤器进行比较，实现为如下的 `log` 和 `Debug` 函数：

```go
func (l *Logger) log(level LogLevel, topic LogTopic, format string, a ...interface{}) {
	if level > l.level {
		return
	}

	if topic != dDefault && ContainStr(l.filter, string(topic)) {
		return
	}

	var prefix string
	if topic != dDefault {
		prefix += fmt.Sprintf("%08d [%6s]", l.time(), topic)
	} else {
		prefix += fmt.Sprintf("%08d [%6s]", l.time(), llsMap[level])
	}
	l.logger.Printf(prefix+format+"\n", a...)
}

func (l *Logger) Debug(topic LogTopic, format string, a ...interface{}) {
	l.log(LogDebug, topic, format, a...)
}

func ContainStr(s []string, e string) bool {
	for _, v := range s {
		if v == e {
			return true
		}
	}
	return false
}
```

### 颜色

在命令行中输出带颜色的文字其实并不复杂，只需要正确配置 ANSI Escape Code 即可。现在大部分的终端都支持 8-bit 的颜色，甚至许多终端还支持 24-bit 的颜色，不过为了兼容性我们还是使用 8-bit 的颜色：

```
\033[38;5;<n>m<message>\033[0m
```

这里 `n` 是颜色的编号，为方便起见，我们可以使用一个 `map` 来存储不同等级或主题的颜色：

```go
var llcMap = map[LogLevel]uint8{
	LogError: 9,  // bright red
	LogWarn:  11, // bright yellow
	LogInfo:  10, // bright green
	LogDebug: 8,  // gray
	LogTrace: 7,  // white
}

var ltcMap = map[LogTopic]uint8{
	dLeader:  3,  // yellow
	dClient:  2,  // green
	dCommit:  5,  // magenta
	dVote:    6,  // cyan
	dTimer:   4,  // blue
	dPersist: 7,  // white
	dSnap:    12, // bright blue
}
```

如此一来，我们便可以在输出时根据日志等级和主题来选择颜色：

```go
func (l *Logger) log(level LogLevel, topic LogTopic, format string, a ...interface{}) {
	if level > l.level {
		return
	}

	if topic != dDefault && ContainStr(l.filter, string(topic)) {
		return
	}

	var prefix, suffix string
	if l.color {
		if topic != dDefault {
			prefix += fmt.Sprintf("\033[38;5;%dm%08d [%6s]", ltcMap[topic], l.time(), topic)
		} else {
			prefix += fmt.Sprintf("\033[38;5;%dm%08d [%6s]", llcMap[level], l.time(), llsMap[level])
		}
		suffix = "\033[0m"
	}
	l.logger.Printf(prefix+format+suffix+"\n", a...)
}
```

### 配置

最后，再加上从环境变量读取配置的功能：

```go
func parseLogLevel(level string) LogLevel {
	if l, ok := sllMap[level]; ok {
		return l
	}
  // 默认为 LogError
	return LogError
}

func NewLogger() *Logger {
	level := parseLogLevel(os.Getenv("LOG_LEVEL"))
	filter := strings.Split(os.Getenv("LOG_FILTER"), ",")
	color := os.Getenv("LOG_COLOR") == "1"

	return &Logger{
		logger: log.New(os.Stdout, "", 0),
		level:  level,
		filter: filter,
		color:  color,
		start:  time.Now(),
	}
}
```

事实上，我们还可以增加配置让日志输出到文件中。不过我们总可以使用管道将标准输出重定向到文件中，因此这里就不再实现了。

## 使用例

![Logger 使用例](./raft-logger.png)

具体调试的时候，配合一个可以搜索字段的终端或文本编辑器便可以方便的定位问题了。当然，`grep` 也是一个不错的选择。

## 总结

在本文中，我们实现了一个功能丰富的 Logger，它可以输出带颜色的日志，并且可以根据日志等级和主题进行过滤。这个 Logger 也是我在实现 Raft 时最常用的工具，希望它也能帮助到你。显然，这个 Logger 并不是最好的，但是它足够简单，足够实用，足以完成实验。一些可能的改进包括：

1. 像 Jose Javier Gonzalez Ortiz 的实现一样，让不同节点的日志分列输出。
2. 利用 `log.Logger` 的其他函数获得更丰富的功能。

在下一篇文章中，我将分享 lab 2A 的实现思路和遇到的一些问题。

## 参考

1. [Debugging by Pretty Printing][debugging-pretty]
2. [Go log package][go-log]
3. [Rust log crate][rust-log]
4. [ANSI Escape Code][ansi-escape-code]

[debugging-pretty]: https://blog.josejg.com/debugging-pretty/
[go-log]: https://pkg.go.dev/log
[rust-log]: https://crates.io/crates/log
[ansi-escape-code]: https://en.wikipedia.org/wiki/ANSI_escape_code
