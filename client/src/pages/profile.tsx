import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Plus, X, Briefcase, FileText, Save } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function ProfilePage() {
    const { user } = useAuth();
    const { toast } = useToast();

    // Local state for form fields
    const [bio, setBio] = useState("");
    const [skills, setSkills] = useState<string[]>([]);
    const [newSkill, setNewSkill] = useState("");
    const [experience, setExperience] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // Initialize state from user data
    useEffect(() => {
        if (user) {
            setBio(user.bio || "");
            setSkills(user.skills || []);
            setExperience(user.experience || []);
        }
    }, [user]);

    const updateProfileMutation = useMutation({
        mutationFn: async (data: any) => {
            const res = await apiRequest("PUT", "/api/v1/profile", data);
            return res.json();
        },
        onSuccess: (updatedUser) => {
            queryClient.setQueryData(["/api/v1/me"], updatedUser);
            toast({
                title: "Profile Updated",
                description: "Your profile information has been saved.",
            });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to update profile.",
                variant: "destructive",
            });
        },
    });

    const uploadResumeMutation = useMutation({
        mutationFn: async () => {
            // In a real implementation, we would send a FormData object with the file
            // const formData = new FormData();
            // formData.append('resume', file);
            // For now, we just trigger the mock extraction endpoint
            const res = await apiRequest("POST", "/api/v1/profile/upload_resume", {});
            return res.json();
        },
        onSuccess: (updatedUser) => {
            queryClient.setQueryData(["/api/v1/me"], updatedUser);
            // Update local state immediately
            setBio(updatedUser.bio || "");
            setSkills(updatedUser.skills || []);
            setExperience(updatedUser.experience || []);

            toast({
                title: "Resume Parsed",
                description: "We've extracted your skills and experience from your resume!",
            });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to parse resume.",
                variant: "destructive",
            });
        },
    });

    const handleSave = () => {
        updateProfileMutation.mutate({
            user: {
                bio,
                skills,
                experience
            }
        });
    };

    const handleAddSkill = () => {
        if (newSkill.trim() && !skills.includes(newSkill.trim())) {
            setSkills([...skills, newSkill.trim()]);
            setNewSkill("");
        }
    };

    const handleRemoveSkill = (skillToRemove: string) => {
        setSkills(skills.filter(s => s !== skillToRemove));
    };

    const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Simulate upload delay and then trigger mutation
        setIsUploading(true);
        setTimeout(() => {
            uploadResumeMutation.mutate();
            setIsUploading(false);
            // Reset input
            e.target.value = "";
        }, 1000);
    };

    const handleAddExperience = () => {
        setExperience([
            ...experience,
            {
                title: "New Role",
                company: "Company Name",
                duration: "Duration",
                description: "Description of your role..."
            }
        ])
    };

    const handleUpdateExperience = (index: number, field: string, value: string) => {
        const newExp = [...experience];
        newExp[index] = { ...newExp[index], [field]: value };
        setExperience(newExp);
    };

    const handleRemoveExperience = (index: number) => {
        setExperience(experience.filter((_, i) => i !== index));
    };

    if (!user) return null;

    return (
        <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Your Profile</h1>
                    <p className="text-muted-foreground mt-1">Manage your professional identity and resume</p>
                </div>
                <Button onClick={handleSave} disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resume Parsing</CardTitle>
                            <CardDescription>Upload your CV to auto-fill your profile details.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    accept=".pdf,.doc,.docx"
                                    onChange={handleResumeUpload}
                                    disabled={isUploading || uploadResumeMutation.isPending}
                                />
                                <div className="flex flex-col items-center gap-2">
                                    {isUploading || uploadResumeMutation.isPending ? (
                                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                    ) : (
                                        <Upload className="w-8 h-8 text-primary" />
                                    )}
                                    <p className="text-sm font-medium">
                                        {isUploading || uploadResumeMutation.isPending ? "Analyzing Resume..." : "Drop resume or click to upload"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">PDF, DOCX up to 5MB</p>
                                </div>
                            </div>
                            {user.resume_url && (
                                <div className="mt-4 flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded">
                                    <FileText className="w-4 h-4" />
                                    <span>Resume uploaded</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Skills</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {skills.map(skill => (
                                    <Badge key={skill} variant="secondary" className="px-2 py-1">
                                        {skill}
                                        <button
                                            onClick={() => handleRemoveSkill(skill)}
                                            className="ml-2 hover:text-destructive"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={newSkill}
                                    onChange={(e) => setNewSkill(e.target.value)}
                                    placeholder="Add a skill..."
                                    onKeyDown={(e) => e.key === "Enter" && handleAddSkill()}
                                />
                                <Button size="icon" variant="outline" onClick={handleAddSkill}>
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Professional Bio</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <Label>About You</Label>
                                <Textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    className="min-h-[120px]"
                                    placeholder="Tell us about your professional background and goals..."
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Experience</CardTitle>
                            <Button size="sm" variant="outline" onClick={handleAddExperience}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Role
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {experience.map((exp, index) => (
                                <div key={index} className="relative pl-6 border-l-2 border-muted pb-6 last:pb-0">
                                    <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-primary" />

                                    <div className="grid gap-4 mb-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label>Title</Label>
                                                <Input
                                                    value={exp.title}
                                                    onChange={(e) => handleUpdateExperience(index, 'title', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Company</Label>
                                                <Input
                                                    value={exp.company}
                                                    onChange={(e) => handleUpdateExperience(index, 'company', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Duration</Label>
                                            <Input
                                                value={exp.duration}
                                                onChange={(e) => handleUpdateExperience(index, 'duration', e.target.value)}
                                                placeholder="e.g. 2020 - Present"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Description</Label>
                                            <Textarea
                                                value={exp.description}
                                                onChange={(e) => handleUpdateExperience(index, 'description', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleRemoveExperience(index)}
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        Remove
                                    </Button>
                                </div>
                            ))}

                            {experience.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No experience listed yet. Upload your resume or add manually.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
