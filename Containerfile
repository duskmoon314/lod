FROM oven/bun:alpine AS builder

WORKDIR /home/bun/app

COPY . .

RUN bun install --frozen-lockfile
RUN bun run build

FROM svenstaro/miniserve:alpine AS app
WORKDIR /home/app

COPY --from=builder /home/bun/app/build ./build

EXPOSE 8080

ENTRYPOINT ["/app/miniserve", "-p", "8080", "--index", "index.html", "build"]