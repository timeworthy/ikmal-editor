# Build the complete manager from the same source files used by local tests.
#
# Pinned to BUILDPLATFORM so the compiler always runs natively and cross-compiles
# to the target. Letting this stage run under QEMU for arm64 would emulate the
# whole Go toolchain, which is minutes slower for no benefit: the binary is
# CGO_ENABLED=0 and cross-compiles cleanly.
FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -o /out/ikmal-editor .

# Runtime image for deterministic quality/proxy smoke tests and optional
# containerized deployments. LanguageTool itself may be supplied separately.
FROM eclipse-temurin:17-jre-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl nodejs npm \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/ikmal-editor /usr/local/bin/ikmal-editor

WORKDIR /root
EXPOSE 8096 8097 8098 8099
ENTRYPOINT ["ikmal-editor"]
