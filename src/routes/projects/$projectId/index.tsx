import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Database,
  ExternalLink,
  History,
  Monitor,
  SearchX,
  Send,
  Smartphone,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { EmptyState } from "@/client/components/EmptyState";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Textarea } from "@/client/components/ui/textarea";
import { timeAgo } from "@/client/lib/time";
import { previewPage, SANDBOX } from "@/lib/appPage";
import {
  clearStore,
  getModelStatus,
  getProject,
  getVersionHtml,
  publish,
  restoreVersion,
  sendChatMessage,
  unpublish,
} from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$projectId/")({
  loader: async ({ params }) => {
    const valid = /^[0-9a-f-]{36}$/i.test(params.projectId);
    const [project, model] = await Promise.all([
      valid ? getProject({ data: { id: params.projectId } }) : null,
      getModelStatus(),
    ]);
    return { project, model };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.project?.name ?? "App Maker" }],
  }),
  component: ProjectPage,
});

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "That didn't work. Try again.";

function ProjectPage() {
  const { project, model } = Route.useLoaderData();
  if (!project) {
    return (
      <AppShell>
        <PageHeader title="App not found" backLink={<BackLink to="/">Your apps</BackLink>} />
        <div data-testid="project-not-found">
          <EmptyState
            icon={SearchX}
            title="There's no app here"
            description="It was deleted, or it belongs to someone else."
          />
        </div>
      </AppShell>
    );
  }
  return <Workspace key={project.id} project={project} model={model} />;
}

function Workspace({
  project,
  model,
}: {
  project: Project;
  model: { on: boolean; setup: string | null };
}) {
  const router = useRouter();
  const [aiOff, setAiOff] = useState<{ setup: string | null } | null>(
    model.on ? null : { setup: model.setup },
  );
  // An older version picked from the list, shown until "Back to current".
  const [shown, setShown] = useState<{ number: number; html: string } | null>(null);
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [publishing, setPublishing] = useState(false);

  const live = project.publishedVersion !== null;
  const previewNumber = shown?.number ?? project.currentVersion;
  const previewHtml = shown?.html ?? project.currentHtml;

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorText(cause));
    }
  }

  async function doPublish() {
    setPublishing(true);
    await run(() => publish({ data: { id: project.id } }));
    setPublishing(false);
  }

  const publishActions =
    project.currentVersion === 0 ? null : !live ? (
      <Button data-testid="publish-button" pending={publishing} onClick={() => void doPublish()}>
        Publish
      </Button>
    ) : project.publishedVersion !== project.currentVersion ? (
      <Button data-testid="publish-changes" pending={publishing} onClick={() => void doPublish()}>
        Publish v{project.currentVersion}
      </Button>
    ) : null;

  return (
    <AppShell wide>
      <PageHeader
        backLink={<BackLink to="/">Your apps</BackLink>}
        title={project.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {project.currentVersion > 0 && (
              <span data-testid="current-version">v{project.currentVersion}</span>
            )}
            <Badge data-testid="publish-status" variant={live ? "success" : "outline"}>
              {live ? "Published" : "Draft"}
            </Badge>
          </span>
        }
        actions={publishActions}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Chat project={project} aiOff={aiOff} onAiOff={setAiOff} onNewVersion={() => setShown(null)} />

        <section className="min-w-0 space-y-3" aria-label="Preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedToggle
              value={width}
              onChange={setWidth}
              showLabels
              items={[
                { value: "desktop", label: "Desktop", icon: <Monitor aria-hidden />, testId: "preview-desktop" },
                { value: "phone", label: "Phone", icon: <Smartphone aria-hidden />, testId: "preview-phone" },
              ]}
            />
            <div className="flex items-center gap-2">
              {shown && (
                <>
                  <span data-testid="previewing-old" className="text-sm text-muted-foreground">
                    Showing v{shown.number}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setShown(null)}>
                    Back to v{project.currentVersion}
                  </Button>
                </>
              )}
              {previewNumber > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      data-testid="preview-open"
                      href={`/projects/${project.id}/versions/${previewNumber}/view`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <ExternalLink data-icon="inline-start" aria-hidden />
                  Full size
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-center overflow-hidden rounded-xl border border-border bg-muted p-2">
            {previewHtml === null ? (
              <div data-testid="preview-empty" className="flex h-[600px] w-full items-center justify-center">
                <EmptyState
                  variant="plain"
                  icon={Monitor}
                  title="Nothing to show yet"
                  description="Send a message and the first version appears here."
                />
              </div>
            ) : (
              <iframe
                key={`${previewNumber}-${width}`}
                data-testid="preview-frame"
                title={`Preview of v${previewNumber}`}
                sandbox={SANDBOX}
                srcDoc={previewPage(previewHtml)}
                className={`h-[600px] rounded-lg border border-border bg-background ${
                  width === "phone" ? "w-[375px] max-w-full" : "w-full"
                }`}
              />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Versions
          project={project}
          shownNumber={shown?.number ?? null}
          onPreview={async (number) => {
            try {
              const { html } = await getVersionHtml({ data: { id: project.id, number } });
              if (html !== null) setShown({ number, html });
            } catch (cause) {
              toast.error(errorText(cause));
            }
          }}
          onRestore={(number) =>
            run(async () => {
              await restoreVersion({ data: { id: project.id, number } });
              setShown(null);
            })
          }
        />
        <div className="space-y-6">
          <Sharing project={project} onUnpublish={() => run(() => unpublish({ data: { id: project.id } }))} />
          <StoredData project={project} onClear={() => run(() => clearStore({ data: { id: project.id } }))} />
        </div>
      </div>
    </AppShell>
  );
}

function Chat({
  project,
  aiOff,
  onAiOff,
  onNewVersion,
}: {
  project: Project;
  aiOff: { setup: string | null } | null;
  onAiOff: (off: { setup: string | null }) => void;
  onNewVersion: () => void;
}) {
  const router = useRouter();
  const first = project.messages.length === 0 && project.currentVersion === 0;
  const [text, setText] = useState(first ? project.description : "");
  // The message being sent, shown until the saved conversation includes it.
  const [pending, setPending] = useState<{ text: string; base: number } | null>(null);
  const [sending, setSending] = useState(false);
  const shownPending =
    pending && project.messages.length === pending.base ? pending.text : null;
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [project.messages.length, shownPending]);

  async function send() {
    const message = text.trim();
    if (!message || sending || aiOff) return;
    setError(null);
    setSending(true);
    setPending({ text: message, base: project.messages.length });
    setText("");
    try {
      const result = await sendChatMessage({ data: { id: project.id, text: message } });
      if (result.status === "off") {
        onAiOff({ setup: result.setup });
        setPending(null);
        setText(message);
      } else if (result.status === "error") {
        setError(result.message);
      } else {
        onNewVersion();
      }
      await router.invalidate();
    } catch (cause) {
      setError(errorText(cause));
      setPending(null);
      setText(message);
    }
    setSending(false);
  }

  return (
    <Card className="flex min-h-[420px] flex-col lg:h-[656px]">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto" aria-label="Conversation">
          {project.messages.map((message) => (
            <ChatBubble key={message.id} role={message.role} content={message.content} version={message.versionNumber} />
          ))}
          {shownPending && <ChatBubble role="user" content={shownPending} version={null} />}
          {sending && (
            <li className="text-sm text-muted-foreground" aria-live="polite">
              Building…
            </li>
          )}
          <div ref={bottom} />
        </ol>
        {aiOff && (
          <Alert data-testid="ai-off">
            <AlertTitle>The AI builder isn't set up</AlertTitle>
            <AlertDescription>
              {aiOff.setup ?? "An admin adds an OpenRouter key to the Gateway to turn it on."}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" data-testid="chat-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Textarea
            data-testid="chat-input"
            aria-label="Message"
            value={text}
            rows={3}
            maxLength={4000}
            disabled={aiOff !== null}
            placeholder={project.currentVersion === 0 ? "Describe the app" : "What should change?"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex justify-end">
            <Button data-testid="chat-send" type="submit" disabled={aiOff !== null || sending}>
              <Send data-icon="inline-start" aria-hidden />
              Send
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChatBubble({
  role,
  content,
  version,
}: {
  role: "user" | "assistant";
  content: string;
  version: number | null;
}) {
  return (
    <li
      data-testid="chat-message"
      data-role={role}
      className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
        role === "user" ? "ml-auto bg-primary/10" : "bg-muted"
      }`}
    >
      {content}
      {version !== null && <span className="mt-1 block text-xs text-muted-foreground">v{version}</span>}
    </li>
  );
}

function Versions({
  project,
  shownNumber,
  onPreview,
  onRestore,
}: {
  project: Project;
  shownNumber: number | null;
  onPreview: (number: number) => void;
  onRestore: (number: number) => Promise<void>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Versions</h2>
      {project.versions.length === 0 ? (
        <EmptyState icon={History} size="sm" title="No versions yet" />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="w-28">When</TableHead>
                <TableHead className="w-40">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.versions.map((version) => {
                const current = version.number === project.currentVersion;
                return (
                  <TableRow key={version.number} data-testid="version-row" data-number={version.number}>
                    <TableCell className="font-medium">v{version.number}</TableCell>
                    <TableCell className="max-w-0 truncate" title={version.prompt}>
                      {version.prompt}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(version.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {current ? (
                          <Badge variant="soft">Current</Badge>
                        ) : (
                          <>
                            <Button
                              data-testid="version-preview"
                              variant={shownNumber === version.number ? "secondary" : "ghost"}
                              size="xs"
                              onClick={() => onPreview(version.number)}
                            >
                              Preview
                            </Button>
                            <RestoreButton number={version.number} onRestore={onRestore} />
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </section>
  );
}

function RestoreButton({ number, onRestore }: { number: number; onRestore: (n: number) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      data-testid="version-restore"
      variant="outline"
      size="xs"
      pending={pending}
      onClick={() => {
        setPending(true);
        void onRestore(number).finally(() => setPending(false));
      }}
    >
      Restore
    </Button>
  );
}

function Sharing({ project, onUnpublish }: { project: Project; onUnpublish: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const live = project.publishedVersion !== null && project.publicUrl;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Public link</h2>
      <Card size="sm">
        <CardContent className="space-y-3 text-sm">
          {live ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  data-testid="public-link"
                  href={project.publicUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-medium text-primary hover:underline"
                >
                  {project.publicUrl}
                </a>
                <CopyButton value={project.publicUrl!} successMessage="Link copied." />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  v{project.publishedVersion} is live ·{" "}
                  <span data-testid="visit-count">
                    {project.visits} {project.visits === 1 ? "visit" : "visits"}
                  </span>
                </span>
                <Button
                  data-testid="unpublish-button"
                  variant="outline"
                  size="sm"
                  pending={pending}
                  onClick={() => {
                    setPending(true);
                    void onUnpublish().finally(() => setPending(false));
                  }}
                >
                  Unpublish
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              {project.currentVersion === 0
                ? "Nothing to publish yet."
                : "Publish to get a link anyone can open."}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StoredData({ project, onClear }: { project: Project; onClear: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const { store } = project;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Stored data</h2>
        {store.total > 0 && (
          <Button data-testid="clear-data" variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Clear data
          </Button>
        )}
      </div>
      {store.total === 0 ? (
        <div data-testid="data-empty">
          <EmptyState
            icon={Database}
            size="sm"
            title="No records"
            description="What visitors save in the published app shows up here."
          />
        </div>
      ) : (
        <div data-testid="data-records" className="space-y-3">
          {store.collections.map((collection) => (
            <Card key={collection.name} size="sm" data-testid="data-collection">
              <CardHeader>
                <CardTitle>
                  {collection.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {collection.records.length} {collection.records.length === 1 ? "record" : "records"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {collection.records.map((record) => (
                    <li key={record.id} data-testid="data-record" className="flex gap-3 py-2 text-xs">
                      <code className="min-w-0 flex-1 break-all">{record.data}</code>
                      <span className="shrink-0 text-muted-foreground">{timeAgo(record.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Clear all stored data?"
          confirmLabel="Clear"
          destructive
          pending={pending}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setPending(true);
            void onClear().finally(() => {
              setPending(false);
              setConfirming(false);
            });
          }}
        >
          This can't be undone.
        </ConfirmDialog>
      )}
    </section>
  );
}
