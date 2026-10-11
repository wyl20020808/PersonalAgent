# 合并期间死机后的 Git 引用损坏

状态：两个引用已恢复；Git 对象、源码和历史 Run 核查通过。电脑死机的系统原因未诊断。

用户报告合并期间电脑死机。合并与 DEV 快进均曾成功，随后 DEV 和 `fix/transport-short-integration-20261011` 的引用文件变为 41 个零字节，导致 HEAD 无法解析、已跟踪文件被显示为新增。两份 reflog 的末条仍指向 `0c90301ceea04a60e2128feaad63eac0e1cfa939`，提交对象及双父提交完整。

已将两份损坏引用备份至 `D:/PersonalAgent-data/transport-recovery-20261011/corrupt-ref-0.bin` 和 `corrupt-ref-1.bin`，核对引用长度、全零内容、reflog 和 commit 对象后，按已记录提交精确恢复并 fsync。没有重置工作区、删除历史或改写其他引用。

恢复后 `git fsck --full` 退出 0，仅 dangling 历史对象，无损坏或缺失对象；DEV 源码与合并提交一致。6 个历史 Run 可通过当前状态 schema，8 个历史文件 SHA256 与整合前检查点一致。两个引用后续读回正常。该核查不等于排除所有操作系统或磁盘问题。
