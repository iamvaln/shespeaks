# SheSpeaks backup sidecar (database + photos).
# Runs an in-container scheduler (no host crontab) that pg_dumps the Postgres
# service nightly, gzips it, uploads to Cloudflare R2 via the S3-compatible
# API, and prunes anything older than the retention window. Restore is
# imperative — see docs/backups.md.
FROM alpine:3.20

# aws-cli ships on Alpine since 3.19 (community repo). postgresql16-client
# must match the major version of the `db` service in compose.yml.
RUN apk add --no-cache \
      bash \
      ca-certificates \
      tzdata \
      gzip \
      coreutils \
      postgresql16-client \
      aws-cli \
 && update-ca-certificates

COPY bin/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*

ENV TZ=UTC \
    AWS_DEFAULT_REGION=auto

ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["loop"]
