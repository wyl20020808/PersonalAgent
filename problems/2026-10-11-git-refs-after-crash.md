# 合并期间死机后的 Git 引用损坏

状态：两个引用已恢复；Git 对象、源码和历史 Run 核查通过。电脑死机的系统原因未诊断。

用户报告合并期间电脑死机。合并与 DEV 快进均曾成功，随后 DEV 和 `fix/transport-short-integration-20261011` 的引用文件变为 41 个零字节，导致 HEAD 无法解析、已跟踪文件被显示为新增。两份 reflog 的末条仍指向 `0c90301ceea04a60e2128feaad63eac0e1cfa939`，提交对象及双父提交完整。

已将两份损坏引用备份至 `D:/PersonalAgent-data/transport-recovery-20261011/corrupt-ref-0.bin` 和 `corrupt-ref-1.bin`，核对引用长度、全零内容、reflog 和 commit 对象后，按已记录提交精确恢复并 fsync。没有重置工作区、删除历史或改写其他引用。

恢复后 `git fsck --full` 退出 0，仅 dangling 历史对象，无损坏或缺失对象；DEV 源码与合并提交一致。6 个历史 Run 可通过当前状态 schema，8 个历史文件 SHA256 与整合前检查点一致。两个引用后续读回正常。该核查不等于排除所有操作系统或磁盘问题。

## 2026-10-12 外部审查 H3 复核

本轮在 `D:/PersonalAgent` 执行 `rtk git fsck --full --no-dangling`，退出码 0，无错误输出。未复现外部报告列出的 invalid reflog/missing tree。未修改 refs、reflog 或对象，未执行 gc、prune、reflog expire、fetch，也没有将旧报告描述当作当前损坏证据。

结论：报告可能记录了其他时间点的环境异常，但其“仓库当前真实损坏”的结论本轮不成立；不重新打开当前 Git 损坏工单。不得为消除未复现问题直接清理 reflog/对象，这可能丢失恢复线索。若再出现错误，应先保存完整对象 ID、命令输出和引用备份，再定位缺失对象与历史关系。

Worktree 共享 common object directory，因此共享损坏影响可能存在；普通 clone 不应笼统描述为必然传播所有不可达 reflog 损坏。上述边界不否定原历史修复事实。
