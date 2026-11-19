import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { LayoutTemplate, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
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
import {
  createProject,
  deleteProject,
  getProjects,
  renameProject,
} from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "App Maker" }] }),
  component: Projects,
});

type Project = Awaited<ReturnType<typeof getProjects>>[number];

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "That didn't work. Try again.";

function Projects() {
  const projects = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const newButton = (
    <Button data-testid="new-project" onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" aria-hidden />
      New app
    </Button>
  );

  return (
    <AppShell>
      <PageHeader
        title="Your apps"
        actions={newButton}
      />
      {projects.length === 0 ? (
        <div data-testid="projects-empty">
          <EmptyState
            icon={LayoutTemplate}
            title="No apps yet"
            description="Create one with New app and it will appear here."
          />
        </div>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id} data-testid="project-row" data-id={project.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="hover:underline"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(project.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      data-testid="project-status"
                      variant={project.publishedVersion === null ? "outline" : "success"}
                    >
                      {project.publishedVersion === null ? "Draft" : "Published"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${project.name}`}
                            data-testid="project-actions"
                          />
                        }
                      >
                        <MoreHorizontal aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem data-testid="rename-project" onClick={() => setRenaming(project)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid="delete-project"
                          variant="destructive"
                          onClick={() => setDeleting(project)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {renaming && <RenameDialog project={renaming} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteDialog project={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const { id } = await createProject({ data: { name, description } });
      await navigate({ to: "/projects/$projectId", params: { projectId: id } });
    } catch (cause) {
      setError(errorText(cause));
      setPending(false);
    }
  }

  return (
    <FormDialog
      title="New app"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            data-testid="create-project"
            pending={pending}
            disabled={!name.trim() || !description.trim()}
            onClick={() => void submit()}
          >
            Create
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            data-testid="project-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-description">What should it do?</Label>
          <Textarea
            id="project-description"
            data-testid="project-description"
            value={description}
            maxLength={500}
            rows={3}
            placeholder="A sign-up sheet for the Saturday volunteer shifts."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </FormDialog>
  );
}

function RenameDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      await renameProject({ data: { id: project.id, name } });
      await router.invalidate();
      onClose();
    } catch (cause) {
      toast.error(errorText(cause));
      setPending(false);
    }
  }

  return (
    <FormDialog
      title="Rename app"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            data-testid="rename-save"
            pending={pending}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor="rename-input" className="sr-only">
          Name
        </Label>
        <Input
          id="rename-input"
          data-testid="rename-input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </form>
    </FormDialog>
  );
}

function DeleteDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <ConfirmDialog
      title={`Delete ${project.name}?`}
      confirmLabel="Delete"
      destructive
      pending={pending}
      onClose={onClose}
      onConfirm={() => {
        setPending(true);
        deleteProject({ data: { id: project.id } })
          .then(() => router.invalidate())
          .then(onClose)
          .catch((cause: unknown) => {
            toast.error(errorText(cause));
            setPending(false);
          });
      }}
    >
      Its chat, versions and stored data go too, and its public link stops working.
    </ConfirmDialog>
  );
}
