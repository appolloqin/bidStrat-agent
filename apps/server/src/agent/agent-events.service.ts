import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AgentProgressEvent } from '@bidstrat/shared';
import { AgentRun } from '../entities';

const KEEPALIVE_MS = 15_000;

@Injectable()
export class AgentEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentEventsService.name);
  private readonly emitter = new EventEmitter();
  private readonly keepaliveTimers = new Map<string, NodeJS.Timeout>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.emitter.setMaxListeners(500);
  }

  emitProgress(event: AgentProgressEvent): void {
    this.emitter.emit(`project:${event.projectId}`, event);
  }

  /** 推送「当前活动」提示（不写入数据库，仅前端兜底显示） */
  emitActivity(projectId: string, message: string, payload?: unknown): void {
    this.emitter.emit(`project:${projectId}`, {
      projectId,
      runId: '',
      type: 'log',
      message,
      payload,
      at: new Date().toISOString(),
    } as unknown as AgentProgressEvent);
  }

  /** 连接时根据最近运行（含已结束）的 plan 状态生成快照事件，补齐订阅前可能错过的步骤 */
  private async buildSnapshot(projectId: string): Promise<AgentProgressEvent[]> {
    try {
      const run = await this.dataSource
        .getRepository(AgentRun)
        .createQueryBuilder('r')
        .where('r.project_id = :projectId', { projectId })
        .orderBy('r.started_at', 'DESC')
        .getOne();
      if (!run?.plan?.length) return [];
      const at = run.startedAt ? run.startedAt.toISOString() : new Date().toISOString();
      const events: AgentProgressEvent[] = [];
      for (const p of run.plan) {
        if (p.status === 'DONE') {
          events.push({ runId: run.id, projectId, type: 'step_end', stepId: p.id, message: `完成：${p.title}`, payload: undefined, at });
        } else if (p.status === 'FAILED') {
          events.push({ runId: run.id, projectId, type: 'step_end', stepId: p.id, message: `失败：${p.title}`, payload: undefined, at });
        } else if (p.status === 'RUNNING') {
          events.push({ runId: run.id, projectId, type: 'step_start', stepId: p.id, message: `进行中：${p.title}`, payload: undefined, at });
        }
      }
      if ((run.status === 'SUCCEEDED' || run.status === 'FAILED') && events.length) {
        events.push({
          runId: run.id,
          projectId,
          type: 'run_end',
          message: run.status === 'SUCCEEDED' ? '执行完成' : `执行失败：${run.error ?? ''}`,
          payload: { status: run.status },
          at,
        });
      }
      if (run.status === 'WAITING_HUMAN') {
        events.push({ runId: run.id, projectId, type: 'waiting_human', stepId: run.currentStepId ?? undefined, message: '等待人工确认后继续', payload: undefined, at });
      }
      return events;
    } catch {
      return [];
    }
  }

  subscribe(projectId: string): Observable<MessageEvent> {
    const channel = `project:${projectId}`;
    return new Observable<MessageEvent>((subscriber) => {
      const handler = (e: AgentProgressEvent) => {
        if (!subscriber.closed) subscriber.next({ data: e } as MessageEvent);
      };
      let attached = false;
      const attachLive = () => {
        if (attached) return;
        attached = true;
        this.emitter.on(channel, handler);
        // 一个项目一个 keepalive 定时器：发送心跳以保持连接并证明服务存活
        if (!this.keepaliveTimers.has(channel)) {
          const timer = setInterval(() => {
            this.emitter.emit(channel, {
              projectId,
              runId: '',
              type: 'heartbeat',
              message: '__heartbeat__',
              at: new Date().toISOString(),
            } as unknown as AgentProgressEvent);
          }, KEEPALIVE_MS);
          this.keepaliveTimers.set(channel, timer);
        }
      };
      // 先推送快照，再订阅实时事件，保证连上即看到当前进度，不丢窗口内完成的步骤
      void this.buildSnapshot(projectId).then((events) => {
        for (const ev of events) {
          if (!subscriber.closed) subscriber.next({ data: ev } as MessageEvent);
        }
        attachLive();
      });
      return () => {
        this.emitter.off(channel, handler);
        const t = this.keepaliveTimers.get(channel);
        if (t) {
          clearInterval(t);
          this.keepaliveTimers.delete(channel);
        }
      };
    });
  }

  onModuleDestroy(): void {
    for (const t of this.keepaliveTimers.values()) clearInterval(t);
    this.keepaliveTimers.clear();
  }
}