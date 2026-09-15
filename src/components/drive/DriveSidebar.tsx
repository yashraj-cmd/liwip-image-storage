"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import {
  IconFolderPlus,
  IconLogout,
  IconPhoto,
  IconPlus,
  IconUpload,
  IconFolderUp,
} from "@tabler/icons-react";
import type { DriveUser } from "./DriveApp";

type SidebarProps = {
  masterLabel: string;
  user: DriveUser;
  newOpen: boolean;
  canUpload: boolean;
  onToggleNew: () => void;
  onCloseNew: () => void;
  onHome: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
  onUploadFolder: () => void;
};

export function DriveSidebar({
  masterLabel,
  user,
  newOpen,
  canUpload,
  onToggleNew,
  onCloseNew,
  onHome,
  onNewFolder,
  onUpload,
  onUploadFolder,
}: SidebarProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!newOpen) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onCloseNew();
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [newOpen, onCloseNew]);

  return (
    <aside className="bg-sidebar border-sidebar-border flex w-64 shrink-0 flex-col border-r">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liwip-logo.png" alt="" className="size-5 object-contain" />
        <span className="text-sidebar-foreground text-[14px] font-medium tracking-tight">
          Liwip
        </span>
        <span className="text-muted-foreground ml-auto text-[10px] tracking-[0.18em] uppercase">
          SKU
        </span>
      </div>

      <div ref={menuRef} className="relative px-3 pb-3">
        <button
          type="button"
          onClick={onToggleNew}
          className="bg-primary text-primary-foreground ks-transition inline-flex h-8 w-full items-center justify-center gap-1.5 text-[12px] font-medium hover:opacity-90"
        >
          <IconPlus size={14} stroke={1.75} />
          New
        </button>
        {newOpen && (
          <div className="bg-popover/95 ring-foreground/10 absolute top-[42px] left-3 z-30 w-[208px] p-1 shadow-md ring-1 backdrop-blur-md">
            <MenuItem icon={<IconFolderPlus size={14} stroke={1.75} />} onClick={onNewFolder}>
              New SKU folder
            </MenuItem>
            <MenuItem
              icon={<IconUpload size={14} stroke={1.75} />}
              disabled={!canUpload}
              onClick={onUpload}
            >
              File upload
            </MenuItem>
            <MenuItem icon={<IconFolderUp size={14} stroke={1.75} />} onClick={onUploadFolder}>
              Folder upload
            </MenuItem>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        <p className="text-muted-foreground px-2 pb-1.5 text-[10px] font-medium tracking-[0.18em] uppercase">
          Library
        </p>
        <SideItem
          icon={<IconPhoto size={16} stroke={1.75} />}
          label={masterLabel}
          active
          onClick={onHome}
        />
      </nav>

      <div className="mt-auto" />

      {user.email && (
        <div className="border-sidebar-border flex h-12 items-center gap-2 border-t px-3">
          {user.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={user.image} alt="" className="size-6 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="bg-sidebar-accent text-sidebar-accent-foreground grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium">
              {user.email.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-[12px]">
            {user.name ?? user.email}
          </span>
          <button
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => void signOut({ redirectTo: "/login" })}
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground ks-transition grid size-6 shrink-0 place-items-center"
          >
            <IconLogout size={14} stroke={1.75} />
          </button>
        </div>
      )}
    </aside>
  );
}

function MenuItem({
  icon,
  disabled,
  onClick,
  children,
}: {
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-popover-foreground hover:bg-accent hover:text-accent-foreground ks-transition disabled:text-muted-foreground flex h-7 w-full items-center gap-2 px-2 text-left text-[12px] disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  );
}

function SideItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ks-transition flex h-8 items-center gap-2 px-2 text-left text-[12px] ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
