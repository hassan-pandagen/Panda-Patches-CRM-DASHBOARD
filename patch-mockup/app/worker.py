"""RQ worker entrypoint — single worker, one mockup job at a time.

This is the "two quotes at once" answer from CLAUDE.md §3: jobs queue on
Redis and are processed sequentially instead of racing for CPU.

Run: python -m app.worker        (docker-compose runs this as the `worker` service)
"""
from .pipeline.jobs import QUEUE_NAME, get_redis

if __name__ == "__main__":
    from rq import Worker

    worker = Worker([QUEUE_NAME], connection=get_redis())
    worker.work(with_scheduler=False)
