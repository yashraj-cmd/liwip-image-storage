"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FolderPlus, FolderUp, Images, LogOut, Plus, Upload } from "lucide-react";
import { signOut } from "next-auth/react";
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
      if (!menuRef.current?.contains(event.target as Node)) {
        onCloseNew();
      }
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [newOpen, onCloseNew]);

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-[#1f1f1f] bg-[#111111]">
      <div className="flex flex-col gap-0.5 px-5 py-4">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/liwip-logo.png" alt="" className="size-8 object-contain" />
          <span className="text-[22px] font-extrabold leading-none tracking-tight text-[#f3ece4]">
            Liwip
          </span>
        </div>
        <p className="pl-[42px] text-[9px] font-medium uppercase tracking-[0.28em] text-[#c4b4a4]">
          Live With Pride.
        </p>
      </div>

      <div ref={menuRef} className="relative px-4 pt-2">
        <button
          type="button"
          onClick={onToggleNew}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#0e7a5c] text-[13px] font-medium text-white hover:bg-[#10956e]"
        >
          <Plus className="size-4" strokeWidth={1.5} />
          New
        </button>
        {newOpen && (
          <div className="absolute top-[52px] left-4 z-30 w-[216px] overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#161616] py-1.5 shadow-xl">
            <button
              type="button"
              onClick={onNewFolder}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#f4f4f4] hover:bg-[#1a1a1a]"
            >
              <FolderPlus className="size-4 text-[#9a9a9a]" strokeWidth={1.5} />
              New SKU folder
            </button>
            <button
              type="button"
              disabled={!canUpload}
              onClick={onUpload}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#f4f4f4] hover:bg-[#1a1a1a] disabled:text-[#5a5a5a]"
            >
              <Upload className="size-4 text-[#9a9a9a]" strokeWidth={1.5} />
              File upload
            </button>
            <button
              type="button"
              onClick={onUploadFolder}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#f4f4f4] hover:bg-[#1a1a1a]"
            >
              <FolderUp className="size-4 text-[#9a9a9a]" strokeWidth={1.5} />
              Folder upload
            </button>
          </div>
        )}
      </div>

      <nav className="mt-6 flex flex-col gap-1 px-3 text-[13px]">
        <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#6f6f6f]">
          Library
        </p>
        <SideItem
          icon={<Images className="size-4" strokeWidth={1.5} />}
          label={masterLabel}
          active
          onClick={onHome}
        />
      </nav>

      {/* Pushes the account card to the bottom of the sidebar. */}
      <div className="mt-auto" />

      {user.email && (
        <div className="flex items-center gap-2.5 border-t border-[#1f1f1f] px-4 py-3.5">
          {user.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.image}
              alt=""
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0e7a5c]/20 text-[12px] font-medium text-[#cde8df]">
              {user.email.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-[#e8e8e8]">
              {user.name ?? user.email}
            </span>
            {user.name && (
              <span className="block truncate text-[11px] text-[#6f6f6f]">{user.email}</span>
            )}
          </span>
          <button
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => void signOut({ redirectTo: "/login" })}
            className="grid size-8 shrink-0 place-items-center rounded-full text-[#cfcfcf] hover:bg-[#1a1a1a] hover:text-white"
          >
            <LogOut className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </aside>
  );
}

function SideItem({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center gap-2.5 rounded-full px-3.5 text-left ${
        active
          ? "bg-[#0e7a5c]/20 font-medium text-[#cde8df]"
          : disabled
            ? "cursor-default text-[#5a5a5a]"
            : "text-[#cfcfcf] hover:bg-[#1a1a1a] hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
